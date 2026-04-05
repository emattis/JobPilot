import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { discoverGreenhouseJobs } from "@/lib/scrapers/greenhouse-discover";
import { discoverLeverJobs } from "@/lib/scrapers/lever-discover";
import { batchScoreJobs } from "@/lib/ai/score-jobs";
import type { DiscoveredJobInput } from "@/lib/scrapers/yc";

function matchesLocation(
  job: { location: string | null; remote: boolean | null },
  preferredLocations: string[]
): boolean {
  // No filter set — show everything
  if (preferredLocations.length === 0) return true;

  // Always show remote jobs if "Remote" is in preferred OR preferRemote is implied
  if (job.remote === true) return true;

  // If location is unknown we can't confirm a match — exclude to be safe when filter is active
  if (job.location === null || job.location.trim() === "") return false;

  const loc = job.location.toLowerCase();
  return preferredLocations.some((pref) => {
    const p = pref.toLowerCase().trim();
    if (p === "remote") return job.remote === true;
    return loc.includes(p);
  });
}

// ── GET: return existing discovered jobs ─────────────────────────────────────

export async function GET() {
  try {
    const [rawJobs, profile] = await Promise.all([
      prisma.discoveredJob.findMany({
        where: { dismissed: false },
        orderBy: [{ relevanceScore: "desc" }, { savedAt: "desc" }],
      }),
      prisma.userProfile.findFirst({ select: { preferredLocations: true } }),
    ]);

    const preferredLocations = profile?.preferredLocations ?? [];
    console.log(`[discover] preferredLocations from DB: [${preferredLocations.join(", ")}]`);
    console.log(`[discover] Total jobs before filter: ${rawJobs.length}`);

    const jobs = rawJobs.filter((j) => matchesLocation(j, preferredLocations));
    console.log(`[discover] Jobs after location filter: ${jobs.length}`);

    return NextResponse.json({ success: true, data: jobs });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch discovered jobs" },
      { status: 500 }
    );
  }
}

// ── PATCH: dismiss / restore a job ───────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const { id, dismissed } = (await request.json()) as {
      id: string;
      dismissed: boolean;
    };
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }
    const updated = await prisma.discoveredJob.update({
      where: { id },
      data: { dismissed },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}

// ── POST: trigger a discovery scan with SSE streaming ────────────────────────

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sse(event)));

      try {
        // ── Load profile ───────────────────────────────────────────────────
        const profile = await prisma.userProfile.findFirst();
        if (!profile) {
          send({ type: "error", error: "Complete your profile first." });
          controller.close();
          return;
        }

        console.log(`[discover] targetRoles: ${profile.targetRoles.join(", ")}`);
        console.log(`[discover] targetCompanies: ${profile.targetCompanies.join(", ")}`);
        console.log(`[discover] preferredLocations: [${(profile.preferredLocations ?? []).join(", ")}]`);

        // ── Load existing DB state ─────────────────────────────────────────
        const existingJobs = await prisma.discoveredJob.findMany({
          select: { id: true, url: true, relevanceScore: true },
        });
        const existingByUrl = new Map(existingJobs.map((j) => [j.url, j]));

        // Jobs that need re-scoring: previously failed (score = 0 or null)
        const staleUrls = new Set(
          existingJobs
            .filter((j) => j.relevanceScore === null || j.relevanceScore === 0)
            .map((j) => j.url)
        );
        console.log(`[discover] ${existingJobs.size} existing jobs, ${staleUrls.size} need re-scoring`);

        const newJobsToScore: DiscoveredJobInput[] = [];

        // ── Company boards (Greenhouse + Lever) ────────────────────────────
        const companies = profile.targetCompanies.slice(0, 20);
        if (companies.length === 0) {
          send({ type: "status", message: "No target companies set — add companies to your profile to discover jobs" });
        } else {
          send({
            type: "status",
            message: `Scanning ${companies.length} company board${companies.length !== 1 ? "s" : ""}…`,
          });

          for (const company of companies) {
            const ghJobs = await discoverGreenhouseJobs(company, profile.targetRoles);
            const lvJobs = await discoverLeverJobs(company, profile.targetRoles);

            for (const job of [...ghJobs, ...lvJobs]) {
              if (!existingByUrl.has(job.url)) {
                // Brand new job
                existingByUrl.set(job.url, { id: "", url: job.url, relevanceScore: null });
                newJobsToScore.push(job);
              } else if (staleUrls.has(job.url)) {
                // Already in DB but needs re-scoring
                newJobsToScore.push(job);
              }
            }

            await new Promise((r) => setTimeout(r, 300));
          }
        }

        console.log(`[discover] ${newJobsToScore.length} jobs to score (new + stale)`);
        send({
          type: "status",
          message: `Found ${newJobsToScore.length} job${newJobsToScore.length !== 1 ? "s" : ""} to score…`,
        });

        if (newJobsToScore.length === 0) {
          // Nothing new or stale — just return the current feed
          const allRaw = await prisma.discoveredJob.findMany({
            where: { dismissed: false },
            orderBy: [{ relevanceScore: "desc" }, { savedAt: "desc" }],
          });
          const preferredLocations = profile.preferredLocations ?? [];
          const allJobs = allRaw.filter((j) => matchesLocation(j, preferredLocations));
          console.log(`[discover] No new jobs; returning ${allJobs.length} existing (${allRaw.length} before location filter)`);
          send({ type: "complete", newJobs: 0, jobs: allJobs });
          controller.close();
          return;
        }

        // ── AI relevance scoring ────────────────────────────────────────────
        send({
          type: "status",
          message: `Scoring ${newJobsToScore.length} job${newJobsToScore.length !== 1 ? "s" : ""} with AI…`,
        });

        const scored = await batchScoreJobs(newJobsToScore, {
          skills: profile.skills,
          targetRoles: profile.targetRoles,
          yearsExperience: profile.yearsExperience,
          preferRemote: profile.preferRemote,
          industries: profile.industries,
          summary: profile.summary,
        });

        // ── Persist to DB ───────────────────────────────────────────────────
        send({ type: "status", message: "Saving results…" });

        const saved = await Promise.allSettled(
          scored.map((job) =>
            prisma.discoveredJob.upsert({
              where: { url: job.url },
              create: {
                url: job.url,
                title: job.title,
                company: job.company,
                location: job.location,
                remote: job.remote,
                source: job.source,
                relevanceScore: job.relevanceScore,
                reasoning: job.reasoning,
              },
              update: {
                relevanceScore: job.relevanceScore,
                reasoning: job.reasoning,
              },
            })
          )
        );

        const newCount = scored.filter((j) => !staleUrls.has(j.url)).length;
        console.log(`[discover] Saved ${saved.filter((r) => r.status === "fulfilled").length}; ${newCount} genuinely new`);

        // Return full feed sorted by score, filtered by location preference
        const allRaw = await prisma.discoveredJob.findMany({
          where: { dismissed: false },
          orderBy: [{ relevanceScore: "desc" }, { savedAt: "desc" }],
        });
        const preferredLocations = profile.preferredLocations ?? [];
        console.log(`[discover] preferredLocations filter: [${preferredLocations.join(", ")}], raw feed: ${allRaw.length} jobs`);
        const allJobs = allRaw.filter((j) => matchesLocation(j, preferredLocations));
        console.log(`[discover] After location filter: ${allJobs.length} jobs`);

        send({ type: "complete", newJobs: newCount, jobs: allJobs });
      } catch (err) {
        console.error("[discover] POST error:", err);
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Unexpected error",
        });
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
