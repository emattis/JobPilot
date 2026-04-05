import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { scrapeJobPosting, buildJobFromManual } from "@/lib/scrapers/job-posting";
import { scrapeCompanySite } from "@/lib/scrapers/company-site";
import { analyzeJob } from "@/lib/ai/analyze-job";
import type { SseEvent } from "@/types/analysis";

const bodySchema = z.object({
  jobUrl: z.string().url().optional(),
  companyUrl: z.string().optional(),
  resumeId: z.string().optional(),
  // Manual fallback fields
  manual: z
    .object({
      title: z.string().min(1),
      company: z.string().min(1),
      location: z.string().optional(),
      description: z.string().min(50),
    })
    .optional(),
});

function sse(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(encoder.encode(sse(event)));
      };

      try {
        // Parse + validate body
        const body = await request.json().catch(() => ({}));
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          send({ type: "error", error: "Invalid request body" });
          controller.close();
          return;
        }
        const { jobUrl, companyUrl, resumeId, manual } = parsed.data;

        if (!jobUrl && !manual) {
          send({ type: "error", error: "Provide either a job URL or manual job details", allowManual: true });
          controller.close();
          return;
        }

        // ── Scrape job posting ──────────────────────────────────────────────
        send({ type: "status", message: "Scraping job posting…" });

        let job;
        if (manual) {
          job = buildJobFromManual(manual);
        } else {
          try {
            job = await scrapeJobPosting(jobUrl!);
            if (!job.title || !job.description || job.description.length < 50) {
              throw new Error("Could not extract enough content from the job page");
            }
          } catch (err) {
            send({
              type: "error",
              error: `Scraping failed: ${err instanceof Error ? err.message : "Unknown error"}. Try pasting the job description manually.`,
              allowManual: true,
            });
            controller.close();
            return;
          }
        }

        // ── Scrape company site ─────────────────────────────────────────────
        let companyInfo: string | null = null;
        if (companyUrl) {
          send({ type: "status", message: "Fetching company information…" });
          companyInfo = await scrapeCompanySite(companyUrl);
        }

        // ── Load profile + resume ───────────────────────────────────────────
        send({ type: "status", message: "Loading your profile…" });

        const profile = await prisma.userProfile.findFirst();
        if (!profile) {
          send({ type: "error", error: "Please complete your profile before running analysis." });
          controller.close();
          return;
        }

        let resumeText: string | null = null;
        if (resumeId) {
          const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
          resumeText = resume?.rawText ?? null;
        } else {
          const defaultResume = await prisma.resume.findFirst({
            where: { userId: profile.id, isDefault: true },
          });
          resumeText = defaultResume?.rawText ?? null;
        }

        // ── Run AI analysis ─────────────────────────────────────────────────
        send({ type: "status", message: "Running AI analysis — this takes ~15 seconds…" });

        const result = await analyzeJob(
          job,
          companyInfo,
          {
            name: profile.name,
            email: profile.email,
            skills: profile.skills,
            yearsExperience: profile.yearsExperience,
            targetRoles: profile.targetRoles,
            summary: profile.summary,
            preferRemote: profile.preferRemote,
            minSalary: profile.minSalary,
            maxSalary: profile.maxSalary,
            industries: profile.industries,
          },
          resumeText
        );

        // ── Persist to DB ───────────────────────────────────────────────────
        send({ type: "status", message: "Saving results…" });

        const jobPosting = await prisma.jobPosting.upsert({
          where: { url: jobUrl ?? `manual:${Date.now()}` },
          create: {
            url: jobUrl ?? `manual:${Date.now()}`,
            title: job.title,
            company: job.company,
            location: job.location,
            remote: job.remote,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            description: job.description,
            requirements: job.requirements,
            niceToHaves: job.niceToHaves,
            skills: job.skills,
            experienceLevel: job.experienceLevel,
            source: job.source,
            postedAt: job.postedAt,
          },
          update: {
            title: job.title,
            company: job.company,
            scrapedAt: new Date(),
          },
        });

        const analysis = await prisma.jobAnalysis.create({
          data: {
            jobId: jobPosting.id,
            overallFitScore: result.overallFitScore,
            skillMatchScore: result.skillMatchScore,
            experienceMatchScore: result.experienceMatchScore,
            cultureFitScore: result.cultureFitScore,
            growthPotentialScore: result.growthPotentialScore,
            shouldApply: result.shouldApply,
            confidenceLevel: result.confidenceLevel,
            reasoning: result.reasoning,
            matchingSkills: result.matchingSkills,
            missingSkills: result.missingSkills,
            transferableSkills: result.transferableSkills,
            resumeImprovements: result.resumeImprovements,
            coverLetterTips: result.coverLetterTips,
            interviewPrepTopics: result.interviewPrepTopics,
            companyAnalysis: result.companyAnalysis,
          },
        });

        send({
          type: "complete",
          analysisId: analysis.id,
          jobId: jobPosting.id,
          result,
          job,
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "An unexpected error occurred",
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
