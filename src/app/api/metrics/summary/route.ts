import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getGeminiClient, MODEL } from "@/lib/ai/client";
import { subDays } from "date-fns";

export async function GET() {
  try {
    const sevenDaysAgo = subDays(new Date(), 7);

    const [recentApps, allApps, recentAnalyses] = await Promise.all([
      prisma.application.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        include: { job: { select: { title: true, company: true } } },
      }),
      prisma.application.findMany({
        select: { status: true, appliedAt: true, createdAt: true },
      }),
      prisma.jobAnalysis.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { missingSkills: true, overallFitScore: true },
      }),
    ]);

    const recentApplied = recentApps.filter((a) => a.appliedAt);
    const totalApplied = allApps.filter((a) => a.appliedAt).length;
    const avgFitScore = recentAnalyses.length
      ? Math.round(recentAnalyses.reduce((s, a) => s + a.overallFitScore, 0) / recentAnalyses.length)
      : null;

    const topMissingSkills: Record<string, number> = {};
    for (const a of recentAnalyses) {
      for (const skill of a.missingSkills) {
        const k = skill.trim().toLowerCase();
        if (k) topMissingSkills[k] = (topMissingSkills[k] ?? 0) + 1;
      }
    }
    const topGaps = Object.entries(topMissingSkills)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => s);

    const statusCounts: Record<string, number> = {};
    for (const a of allApps) {
      statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    }

    const prompt = `You are a job search strategist giving a brief weekly recap.

This week's data:
- ${recentApplied.length} new applications submitted (${totalApplied} total all-time)
- ${recentAnalyses.length} jobs analyzed
${avgFitScore !== null ? `- Average fit score: ${avgFitScore}/100` : ""}
- Current pipeline: ${Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(", ")}
${topGaps.length > 0 ? `- Most common skill gaps this week: ${topGaps.join(", ")}` : ""}
${recentApps.length > 0 ? `- Recent applications: ${recentApps.slice(0, 5).map((a) => `${a.job.title} at ${a.job.company}`).join("; ")}` : ""}

Write a 3-4 sentence weekly summary: what went well, what needs attention, and one specific strategic recommendation. Be direct and actionable. No fluff.`;

    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: MODEL,
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    });

    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();

    return NextResponse.json({
      success: true,
      data: {
        summary,
        weekStats: {
          applied: recentApplied.length,
          analyzed: recentAnalyses.length,
          avgFitScore,
        },
      },
    });
  } catch (err) {
    console.error("[metrics/summary GET]", err);
    return NextResponse.json({ success: false, error: "Failed to generate summary" }, { status: 500 });
  }
}
