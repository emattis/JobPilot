import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { discoverGreenhouseJobs } from "@/lib/scrapers/greenhouse-discover";
import { discoverLeverJobs } from "@/lib/scrapers/lever-discover";
import { discoverGenericJobs } from "@/lib/scrapers/generic-discover";
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
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    const [rawJobs, profile] = await Promise.all([
      prisma.discoveredJob.findMany({
        where: { dismissed: false, userId: profileId },
        orderBy: [{ relevanceScore: "desc" }, { savedAt: "desc" }],
      }),
      prisma.userProfile.findUnique({ where: { id: profileId }, select: { preferredLocations: true } }),
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
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id, dismissed } = (await request.json()) as {
      id: string;
      dismissed: boolean;
    };
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    const job = await prisma.discoveredJob.findUnique({ where: { id } });
    if (!job || job.userId !== session.profileId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
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
        // ── Auth check ────────────────────────────────────────────────────
        const session = await getSessionUser();
        if (!session) {
          send({ type: "error", error: "Unauthorized" });
          controller.close();
          return;
        }
        const profileId = session.profileId;

        // ── Load profile ───────────────────────────────────────────────────
        const profile = await prisma.userProfile.findUnique({ where: { id: profileId } });
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
          where: { userId: profileId },
          select: { id: true, url: true, relevanceScore: true },
        });
        const existingByUrl = new Map(existingJobs.map((j) => [j.url, j]));

        // Jobs that need re-scoring: previously failed (score = 0/null, or "Could not score")
        const existingWithReasoning = await prisma.discoveredJob.findMany({
          where: { userId: profileId },
          select: { url: true, relevanceScore: true, reasoning: true },
        });
        const staleUrls = new Set(
          existingWithReasoning
            .filter(
              (j) =>
                j.relevanceScore === null ||
                j.relevanceScore === 0 ||
                j.reasoning === "Could not score" ||
                j.reasoning === ""
            )
            .map((j) => j.url)
        );
        console.log(`[discover] ${existingJobs.length} existing jobs, ${staleUrls.size} need re-scoring`);

        const newJobsToScore: DiscoveredJobInput[] = [];

        // ── Load sources from CompanyWatchlist ─────────────────────────────
        const watchlistSources = await prisma.companyWatchlist.findMany({
          where: { userId: profileId, active: true },
          select: { id: true, name: true, slug: true, atsType: true, careerUrl: true },
        });

        // Build a combined list: profile target companies (scan both GH + Lever)
        // plus watchlist sources (scan by their specific ATS type or AI for custom)
        interface ScanTarget {
          name: string;
          slug: string;
          atsType: "greenhouse" | "lever" | "both" | "custom";
          careerUrl?: string;
          watchlistId?: string;
        }

        const scanTargets: ScanTarget[] = [];
        const seenSlugs = new Set<string>();

        // Add watchlist sources first (they have explicit ATS types)
        for (const src of watchlistSources) {
          const ats = src.atsType === "greenhouse" || src.atsType === "lever"
            ? src.atsType
            : (src.atsType === "ashby" || src.atsType === "workday" || src.atsType === "custom")
            ? "custom" as const
            : "both" as const;
          scanTargets.push({ name: src.name, slug: src.slug, atsType: ats, careerUrl: src.careerUrl, watchlistId: src.id });
          seenSlugs.add(src.slug.toLowerCase());
        }

        // Add profile target companies that aren't already in the watchlist
        for (const company of profile.targetCompanies) {
          const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          if (!seenSlugs.has(slug)) {
            scanTargets.push({ name: company, slug, atsType: "both" });
            seenSlugs.add(slug);
          }
        }

        if (scanTargets.length === 0) {
          send({ type: "status", message: "No companies to scan — add companies to your profile or the Sources page" });
        } else {
          send({
            type: "status",
            message: `Scanning ${scanTargets.length} company board${scanTargets.length !== 1 ? "s" : ""}…`,
          });

          for (const target of scanTargets) {
            send({ type: "status", message: `Scanning ${target.name}…` });

            const jobs: DiscoveredJobInput[] = [];
            if (target.atsType === "greenhouse" || target.atsType === "both") {
              jobs.push(...(await discoverGreenhouseJobs(target.slug, profile.targetRoles)));
            }
            if (target.atsType === "lever" || target.atsType === "both") {
              jobs.push(...(await discoverLeverJobs(target.slug, profile.targetRoles)));
            }
            if (target.atsType === "custom" && target.careerUrl) {
              jobs.push(...(await discoverGenericJobs(target.careerUrl, target.name, profile.targetRoles)));
            }

            for (const job of jobs) {
              if (!existingByUrl.has(job.url)) {
                existingByUrl.set(job.url, { id: "", url: job.url, relevanceScore: null });
                newJobsToScore.push(job);
              } else if (staleUrls.has(job.url)) {
                newJobsToScore.push(job);
              }
            }

            // Update watchlist last scanned
            if (target.watchlistId) {
              await prisma.companyWatchlist.update({
                where: { id: target.watchlistId },
                data: { lastScanned: new Date(), jobsFound: jobs.length },
              }).catch(() => {});
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
            where: { dismissed: false, userId: profileId },
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
                userId: profile.id,
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
        const fulfilled = saved.filter((r) => r.status === "fulfilled").length;
        const rejected = saved.filter((r) => r.status === "rejected");
        console.log(`[discover] Saved ${fulfilled}/${saved.length}; ${newCount} genuinely new`);
        if (rejected.length > 0) {
          console.error(`[discover] ${rejected.length} DB saves failed:`, rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? r));
        }
        console.log(`[discover] Score distribution:`, scored.map((j) => `${j.company}/${j.title}: ${j.relevanceScore}`).join(", "));

        // Return full feed sorted by score, filtered by location preference
        const allRaw = await prisma.discoveredJob.findMany({
          where: { dismissed: false, userId: profileId },
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
