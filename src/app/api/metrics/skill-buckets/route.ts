import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getGeminiClient, MODEL } from "@/lib/ai/client";
import { parseAiObject } from "@/lib/ai/parse-json";
import { createHash } from "crypto";

interface SkillBucket {
  name: string;
  jobCount: number;
  skills: string[];
}

const bucketCache = new Map<string, { buckets: SkillBucket[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const analyses = await prisma.jobAnalysis.findMany({
      where: { userId: session.profileId },
      select: { missingSkills: true },
    });

    const skillFreq: Record<string, number> = {};
    for (const a of analyses) {
      for (const skill of a.missingSkills) {
        const normalized = skill.trim().toLowerCase();
        if (normalized) skillFreq[normalized] = (skillFreq[normalized] ?? 0) + 1;
      }
    }
    const skillGaps = Object.entries(skillFreq)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    if (skillGaps.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Check cache
    const key = createHash("md5")
      .update(skillGaps.map((s) => `${s.skill}:${s.count}`).join("|"))
      .digest("hex");

    const cached = bucketCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.buckets });
    }

    // Call Gemini
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: MODEL,
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    });

    const skillList = skillGaps
      .map((s) => `- ${s.skill} (${s.count} jobs)`)
      .join("\n");

    const prompt = `Group these job skills into exactly 4 high-level categories. Each skill should appear in exactly one category. The jobCount for each category should be the sum of the job counts of the skills in that category.

Skills:
${skillList}

Return a JSON object with this exact structure:
{ "buckets": [{ "name": "Category Name", "jobCount": number, "skills": ["skill1", "skill2"] }] }

Rules:
- Exactly 4 buckets
- Category names should be short (2-4 words)
- Sort buckets by jobCount descending
- Include every skill in exactly one bucket
- Return only valid JSON, no markdown`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = parseAiObject<{ buckets: SkillBucket[] }>(text);

    bucketCache.set(key, { buckets: parsed.buckets, ts: Date.now() });
    return NextResponse.json({ success: true, data: parsed.buckets });
  } catch (err) {
    console.error("[metrics/skill-buckets] Error:", err);
    return NextResponse.json({ success: true, data: [] });
  }
}
