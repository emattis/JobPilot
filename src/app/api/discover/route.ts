import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeYCJobs } from "@/lib/scrapers/yc";
import { discoverGreenhouseJobs } from "@/lib/scrapers/greenhouse-discover";
import { discoverLeverJobs } from "@/lib/scrapers/lever-discover";
import { batchScoreJobs } from "@/lib/ai/score-jobs";
import type { DiscoveredJobInput } from "@/lib/scrapers/yc";

function matchesLocation(
  job: { location: string | null; remote: boolean | null },
  preferredLocations: string[]
): boolean {
  if (preferredLocations.length === 0) return true;
  if (job.remote === true) return true;
  if (job.location === null) return true; // unknown — don't filter out
  const loc = job.location.toLowerCase();
  return preferredLocations.some((pref) =>
    pref.toLowerCase() === "remote"
      ? job.remote === true
      : loc.includes(pref.toLowerCase())
  );
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
    const jobs = rawJobs.filter((j) => matchesLocation(j, preferredLocations));

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

        // ── Collect known URLs to skip ─────────────────────────────────────
        const existingUrls = new Set(
          (await prisma.discoveredJob.findMany({ select: { url: true } })).map(
            (j) => j.url
          )
        );

        const allFound: DiscoveredJobInput[] = [];

        // ── YC Work at a Startup ───────────────────────────────────────────
        send({ type: "status", message: "Scanning YC Work at a Startup…" });
        try {
          const ycJobs = await scrapeYCJobs(
            profile.targetRoles,
            profile.preferRemote
          );
          const newYC = ycJobs.filter((j) => !existingUrls.has(j.url));
          newYC.forEach((j) => existingUrls.add(j.url));
          allFound.push(...newYC);
          send({
            type: "status",
            message: `YC: found ${newYC.length} new job${newYC.length !== 1 ? "s" : ""}`,
          });
        } catch {
          send({ type: "status", message: "YC scan failed — skipping" });
        }

        // ── Company boards (Greenhouse + Lever) ────────────────────────────
        const companies = profile.targetCompanies.slice(0, 20);
        if (companies.length > 0) {
          send({
            type: "status",
            message: `Scanning ${companies.length} company board${companies.length !== 1 ? "s" : ""}…`,
          });

          for (const company of companies) {
            // Try Greenhouse
            try {
              const ghJobs = await discoverGreenhouseJobs(
                company,
                profile.targetRoles
              );
              const newGH = ghJobs.filter((j) => !existingUrls.has(j.url));
              newGH.forEach((j) => existingUrls.add(j.url));
              allFound.push(...newGH);
            } catch {
              // per-company failures are silent
            }

            // Try Lever
            try {
              const lvJobs = await discoverLeverJobs(
                company,
                profile.targetRoles
              );
              const newLV = lvJobs.filter((j) => !existingUrls.has(j.url));
              newLV.forEach((j) => existingUrls.add(j.url));
              allFound.push(...newLV);
            } catch {
              // per-company failures are silent
            }

            await new Promise((r) => setTimeout(r, 300));
          }

          send({
            type: "status",
            message: `Company boards: found ${allFound.filter((j) => j.source !== "yc").length} new jobs`,
          });
        }

        if (allFound.length === 0) {
          send({ type: "complete", newJobs: 0, jobs: [] });
          controller.close();
          return;
        }

        // ── AI relevance scoring ────────────────────────────────────────────
        send({
          type: "status",
          message: `Scoring ${allFound.length} job${allFound.length !== 1 ? "s" : ""} with AI…`,
        });

        const scored = await batchScoreJobs(allFound, {
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

        const savedCount = saved.filter((r) => r.status === "fulfilled").length;

        // Return full feed sorted by score, filtered by location preference
        const allRaw = await prisma.discoveredJob.findMany({
          where: { dismissed: false },
          orderBy: [{ relevanceScore: "desc" }, { savedAt: "desc" }],
        });
        const preferredLocations = profile.preferredLocations ?? [];
        const allJobs = allRaw.filter((j) => matchesLocation(j, preferredLocations));

        send({
          type: "complete",
          newJobs: savedCount,
          jobs: allJobs,
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Unexpected error",
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
