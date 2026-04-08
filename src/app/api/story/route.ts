import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getGeminiClient, MODEL, MAX_OUTPUT_TOKENS } from "@/lib/ai/client";
import { parseAiObject } from "@/lib/ai/parse-json";

const bodySchema = z.object({
  applicationId: z.string().min(1),
});

export interface StorySections {
  whyMe: string;
  whyThisCompany: string;
  relevantBackground: string;
  whatIHopeToContribute: string;
  howIllMakeAnImpact: string;
}

export interface StoryResult {
  detailed: StorySections;
  talkingPoints: StorySections;
}

const SYSTEM_PROMPT = `You are an expert career storyteller and interview coach. You help candidates craft authentic, conversational narratives that connect their unique background to specific job opportunities.

Your tone is warm, confident, and genuine — like a candidate talking to a friend about why they're excited about a role. Avoid corporate buzzwords, empty superlatives, and generic filler. Every sentence should be specific to THIS person and THIS job.

Your response must be a single valid JSON object — no markdown, no code fences, no extra text before or after. Just raw JSON.`;

function buildStoryPrompt(
  profile: {
    name: string;
    summary: string | null;
    skills: string[];
    yearsExperience: number | null;
    targetRoles: string[];
    industries: string[];
  },
  resumeText: string | null,
  job: {
    title: string;
    company: string;
    location: string | null;
    description: string;
    requirements: string | null;
    niceToHaves: string | null;
    skills: string[];
  },
  companyAnalysis: string | null
): string {
  return `## Candidate Profile
Name: ${profile.name}
Summary: ${profile.summary ?? "Not provided"}
Skills: ${profile.skills.join(", ") || "Not listed"}
Years of Experience: ${profile.yearsExperience ?? "Not specified"}
Target Roles: ${profile.targetRoles.join(", ") || "Not specified"}
Industries: ${profile.industries.join(", ") || "Not specified"}

## Resume
${resumeText ?? "No resume available — use the profile information above."}

## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "Not specified"}

Description:
${job.description}

${job.requirements ? `Requirements:\n${job.requirements}\n` : ""}
${job.niceToHaves ? `Nice to Haves:\n${job.niceToHaves}\n` : ""}
${job.skills.length > 0 ? `Key Skills: ${job.skills.join(", ")}` : ""}

## Company Analysis
${companyAnalysis ?? "No company analysis available — infer what you can from the job posting."}

## Instructions
Generate TWO versions of a personalized narrative for this candidate tailored to this specific job and company. Return a JSON object with two keys: "detailed" and "talkingPoints". Each contains the same five fields.

### The five sections (used in both versions):
1. "whyMe" — What makes this candidate uniquely suited for this role. Connect specific experiences, skills, and strengths from their resume to what this role needs.
2. "whyThisCompany" — What draws this candidate to this company's mission, product, and culture. Use the company analysis and job posting to identify genuine connection points.
3. "relevantBackground" — A narrative arc connecting the candidate's career journey to this role. Show how each step in their career has built toward this opportunity.
4. "whatIHopeToContribute" — Specific ways the candidate can add value based on the job requirements and their skills.
5. "howIllMakeAnImpact" — Concrete examples of how the candidate's past work translates to outcomes in this role.

### "detailed" version:
Each field should contain 2-4 paragraphs of conversational, authentic text. This is the full narrative — useful for cover letters and deep interview prep. Be specific — reference actual projects, roles, or accomplishments.

### "talkingPoints" version:
Each field should contain 2-3 concise bullet points (use "• " prefix). Each bullet should be one punchy sentence — a memorizable talking point the candidate can recall before walking into an interview. The entire talking points version should be reviewable in under 5 minutes. No filler, no setup — just the key points.

### Tone rules (both versions):
- First-person, conversational, and genuine
- Never fabricate experience
- Never use phrases like "I am a results-driven professional" or "I bring a unique blend of"
- Write like a real person talking about why they're excited`;
}

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ── GET: load a saved story by applicationId ────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const appId = new URL(request.url).searchParams.get("applicationId");
  if (!appId) {
    return NextResponse.json({ success: false, error: "Missing applicationId" }, { status: 400 });
  }

  const story = await prisma.story.findUnique({
    where: { applicationId: appId },
    include: {
      application: {
        select: { job: { select: { title: true, company: true } } },
      },
    },
  });

  if (!story) {
    return NextResponse.json({ success: true, data: null });
  }

  const detailed = JSON.parse(story.detailedVersion) as StorySections;
  const talkingPoints = JSON.parse(story.talkingPointsVersion) as StorySections;

  return NextResponse.json({
    success: true,
    data: {
      story: { detailed, talkingPoints },
      jobTitle: story.application.job.title,
      company: story.application.job.company,
      updatedAt: story.updatedAt,
    },
  });
}

// ── POST: generate a new story (SSE streaming) ─────────────────────────────

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sse(event)));

      try {
        const body = await request.json().catch(() => ({}));
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          send({ type: "error", error: "Invalid request" });
          controller.close();
          return;
        }

        const { applicationId } = parsed.data;

        send({ type: "status", message: "Loading application data..." });

        const application = await prisma.application.findUnique({
          where: { id: applicationId },
          include: {
            job: {
              include: {
                analyses: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { companyAnalysis: true },
                },
              },
            },
          },
        });

        if (!application) {
          send({ type: "error", error: "Application not found" });
          controller.close();
          return;
        }

        const session = await getSessionUser();
        if (!session) {
          send({ type: "error", error: "Unauthorized" });
          controller.close();
          return;
        }
        const profileId = session.profileId;

        if (application.userId !== profileId) {
          send({ type: "error", error: "Application not found" });
          controller.close();
          return;
        }

        const profile = await prisma.userProfile.findUnique({ where: { id: profileId } });
        if (!profile) {
          send({ type: "error", error: "Complete your profile first." });
          controller.close();
          return;
        }

        // Get default resume
        const resume = await prisma.resume.findFirst({
          where: { userId: profile.id, isDefault: true },
        });

        send({ type: "status", message: "Crafting your story with AI..." });

        const job = application.job;
        const companyAnalysis = job.analyses[0]?.companyAnalysis ?? job.roleAnalysisCache ?? null;

        const prompt = buildStoryPrompt(
          {
            name: profile.name,
            summary: profile.summary,
            skills: profile.skills,
            yearsExperience: profile.yearsExperience,
            targetRoles: profile.targetRoles,
            industries: profile.industries,
          },
          resume?.rawText ?? null,
          {
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            requirements: job.requirements,
            niceToHaves: job.niceToHaves,
            skills: job.skills,
          },
          companyAnalysis
        );

        const client = getGeminiClient();
        const model = client.getGenerativeModel({
          model: MODEL,
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.7,
          },
        });

        let fullText = "";
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullText += text;
            send({ type: "token", token: text });
          }
        }

        const storyResult = parseAiObject<StoryResult>(fullText);

        // Save to database
        send({ type: "status", message: "Saving story..." });
        await prisma.story.upsert({
          where: { applicationId },
          create: {
            applicationId,
            detailedVersion: JSON.stringify(storyResult.detailed),
            talkingPointsVersion: JSON.stringify(storyResult.talkingPoints),
          },
          update: {
            detailedVersion: JSON.stringify(storyResult.detailed),
            talkingPointsVersion: JSON.stringify(storyResult.talkingPoints),
          },
        });

        send({
          type: "complete",
          story: storyResult,
          jobTitle: job.title,
          company: job.company,
        });
      } catch (err) {
        console.error("[story] Error:", err);
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Failed to generate story",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
