import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    const [applications, analyses] = await Promise.all([
      prisma.application.findMany({
        include: {
          job: { select: { source: true } },
          statusHistory: { select: { toStatus: true } },
        },
      }),
      prisma.jobAnalysis.findMany({
        select: { missingSkills: true },
      }),
    ]);

    // ── Stat cards ────────────────────────────────────────────────────────────
    const applied = applications.filter((a) => a.appliedAt);
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
      .slice(0, 15);

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
      },
    });
  } catch (err) {
    console.error("[metrics GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load metrics" }, { status: 500 });
  }
}
