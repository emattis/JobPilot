import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getGeminiClient, MODEL } from "@/lib/ai/client";
import { parseAiObject } from "@/lib/ai/parse-json";
import { createHash } from "crypto";

// ── Skill bucket cache ──────────────────────────────────────────────────────

interface SkillBucket {
  name: string;
  jobCount: number;
  skills: string[];
}

const bucketCache = new Map<string, { buckets: SkillBucket[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function bucketizeSkills(
  skillGaps: { skill: string; count: number }[]
): Promise<SkillBucket[]> {
  if (skillGaps.length === 0) return [];

  // Cache key from sorted skill list
  const key = createHash("md5")
    .update(skillGaps.map((s) => `${s.skill}:${s.count}`).join("|"))
    .digest("hex");

  const cached = bucketCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.buckets;

  try {
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
    return parsed.buckets;
  } catch (err) {
    console.error("[metrics] Skill bucketing failed:", err);
    // Fallback: return top 4 skills as individual buckets
    return skillGaps.slice(0, 4).map((s) => ({
      name: s.skill,
      jobCount: s.count,
      skills: [s.skill],
    }));
  }
}

// Statuses that count as "responded" (any movement past APPLIED)
const RESPONDED_STATUSES = [
  "SCREENING",
  "PHONE_INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "ONSITE_INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
];

const INTERVIEW_STATUSES = [
  "PHONE_INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "ONSITE_INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
  "ACCEPTED",
];

const OFFER_STATUSES = ["OFFER", "ACCEPTED"];

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    const [applications, analyses] = await Promise.all([
      prisma.application.findMany({
        where: { userId: profileId },
        include: {
          job: { select: { source: true } },
          statusHistory: { select: { toStatus: true } },
        },
      }),
      prisma.jobAnalysis.findMany({
        where: { userId: profileId },
        select: { missingSkills: true },
      }),
    ]);

    // ── Stat cards ────────────────────────────────────────────────────────────
    // Count as "applied" if appliedAt is set OR status is at/past APPLIED
    const APPLIED_AND_BEYOND = new Set([
      "APPLIED", "SCREENING", "PHONE_INTERVIEW", "TECHNICAL_INTERVIEW",
      "ONSITE_INTERVIEW", "FINAL_ROUND", "OFFER", "ACCEPTED", "REJECTED",
    ]);
    const applied = applications.filter(
      (a) => a.appliedAt || APPLIED_AND_BEYOND.has(a.status)
    );
    const totalApplied = applied.length;

    // An app "responded" if it ever reached a responded status
    const responded = applied.filter(
      (a) =>
        RESPONDED_STATUSES.includes(a.status) ||
        a.statusHistory.some((h) => RESPONDED_STATUSES.includes(h.toStatus))
    );
    const interviewed = applied.filter(
      (a) =>
        INTERVIEW_STATUSES.includes(a.status) ||
        a.statusHistory.some((h) => INTERVIEW_STATUSES.includes(h.toStatus))
    );
    const offered = applied.filter(
      (a) =>
        OFFER_STATUSES.includes(a.status) ||
        a.statusHistory.some((h) => OFFER_STATUSES.includes(h.toStatus))
    );

    const responseRate = totalApplied ? Math.round((responded.length / totalApplied) * 100) : 0;
    const interviewRate = totalApplied ? Math.round((interviewed.length / totalApplied) * 100) : 0;
    const offerRate = totalApplied ? Math.round((offered.length / totalApplied) * 100) : 0;

    // ── Funnel ────────────────────────────────────────────────────────────────
    const funnelStages = [
      { stage: "Applied", count: totalApplied },
      { stage: "Screening", count: applied.filter((a) => a.status === "SCREENING" || a.statusHistory.some((h) => h.toStatus === "SCREENING")).length },
      { stage: "Interview", count: interviewed.length },
      { stage: "Final Round", count: applied.filter((a) => a.status === "FINAL_ROUND" || a.statusHistory.some((h) => h.toStatus === "FINAL_ROUND")).length },
      { stage: "Offer", count: offered.length },
    ];

    // ── Applications per week ─────────────────────────────────────────────────
    const weekMap: Record<string, number> = {};
    for (const a of applied) {
      if (!a.appliedAt) continue;
      const d = new Date(a.appliedAt);
      // Week start (Monday)
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setDate(diff);
      const key = weekStart.toISOString().slice(0, 10);
      weekMap[key] = (weekMap[key] ?? 0) + 1;
    }
    const appsPerWeek = Object.entries(weekMap)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // ── Source effectiveness ──────────────────────────────────────────────────
    const sourceMap: Record<string, { total: number; responded: number }> = {};
    for (const a of applied) {
      const src = a.job.source || "unknown";
      if (!sourceMap[src]) sourceMap[src] = { total: 0, responded: 0 };
      sourceMap[src].total++;
      if (
        RESPONDED_STATUSES.includes(a.status) ||
        a.statusHistory.some((h) => RESPONDED_STATUSES.includes(h.toStatus))
      ) {
        sourceMap[src].responded++;
      }
    }
    const sourceEffectiveness = Object.entries(sourceMap)
      .map(([source, { total, responded: resp }]) => ({
        source,
        total,
        responded: resp,
        rate: total ? Math.round((resp / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // ── Skill gap analysis ───────────────────────────────────────────────────
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

    // AI-bucketed version
    const skillBuckets = await bucketizeSkills(skillGaps);

    // ── Daily activity (last 7 days) ──────────────────────────────────────
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dailyActivity: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = applied.filter((a) => {
        if (!a.appliedAt) return false;
        const d = new Date(a.appliedAt);
        return d >= dayStart && d < dayEnd;
      }).length;
      dailyActivity.push({ day: dayStart.toISOString().slice(0, 10), count });
    }

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalApplications: applications.length,
          totalApplied,
          responseRate,
          interviewRate,
          offerRate,
          responded: responded.length,
          interviewed: interviewed.length,
          offered: offered.length,
        },
        funnel: funnelStages,
        appsPerWeek,
        sourceEffectiveness,
        skillGaps,
        skillBuckets,
        dailyActivity,
      },
    });
  } catch (err) {
    console.error("[metrics GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load metrics" }, { status: 500 });
  }
}
