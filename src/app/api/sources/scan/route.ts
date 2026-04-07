import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { discoverGreenhouseJobs } from "@/lib/scrapers/greenhouse-discover";
import { discoverLeverJobs } from "@/lib/scrapers/lever-discover";
import { batchScoreJobs } from "@/lib/ai/score-jobs";
import type { DiscoveredJobInput } from "@/lib/scrapers/yc";

const bodySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["company", "vc"]),
});

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function scanCompany(
  slug: string,
  atsType: string,
  targetRoles: string[]
): Promise<DiscoveredJobInput[]> {
  const jobs: DiscoveredJobInput[] = [];
  if (atsType === "greenhouse") {
    jobs.push(...(await discoverGreenhouseJobs(slug, targetRoles)));
  } else if (atsType === "lever") {
    jobs.push(...(await discoverLeverJobs(slug, targetRoles)));
  }
  // ashby/workday/custom: not yet implemented, return empty
  return jobs;
}

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

        const { id, kind } = parsed.data;

        const profile = await prisma.userProfile.findFirst({
          select: {
            targetRoles: true,
            skills: true,
            yearsExperience: true,
            preferRemote: true,
            industries: true,
            summary: true,
          },
        });
        if (!profile) {
          send({ type: "error", error: "Complete your profile first." });
          controller.close();
          return;
        }

        const existingJobs = await prisma.discoveredJob.findMany({
          select: { url: true },
        });
        const existingUrls = new Set(existingJobs.map((j) => j.url));

        let newJobs: DiscoveredJobInput[] = [];

        if (kind === "company") {
          const source = await prisma.companyWatchlist.findUnique({ where: { id } });
          if (!source) {
            send({ type: "error", error: "Source not found" });
            controller.close();
            return;
          }

          send({ type: "status", message: `Scanning ${source.name}...` });
          const found = await scanCompany(source.slug, source.atsType, profile.targetRoles);
          newJobs = found.filter((j) => !existingUrls.has(j.url));

          send({ type: "status", message: `Found ${found.length} jobs, ${newJobs.length} new` });

          await prisma.companyWatchlist.update({
            where: { id },
            data: { lastScanned: new Date(), jobsFound: found.length },
          });
        } else {
          // VC/job board source — scan as if it's a list of companies
          // For now, treat VC sources by their portfolio URL pattern
          const source = await prisma.vCSource.findUnique({ where: { id } });
          if (!source) {
            send({ type: "error", error: "Source not found" });
            controller.close();
            return;
          }

          send({ type: "status", message: `Scanning ${source.name} portfolio...` });

          // Try to find companies in our watchlist that came from this VC
          const companies = await prisma.companyWatchlist.findMany({
            where: { vcSource: source.name, active: true },
          });

          if (companies.length === 0) {
            send({ type: "status", message: `No companies linked to ${source.name}. Add companies from this portfolio first.` });
            await prisma.vCSource.update({
              where: { id },
              data: { lastScanned: new Date() },
            });
            send({ type: "complete", newJobs: 0 });
            controller.close();
            return;
          }

          let totalFound = 0;
          for (const company of companies) {
            send({ type: "status", message: `Scanning ${company.name}...` });
            const found = await scanCompany(company.slug, company.atsType, profile.targetRoles);
            const fresh = found.filter((j) => !existingUrls.has(j.url));
            newJobs.push(...fresh);
            for (const j of found) existingUrls.add(j.url);
            totalFound += found.length;

            await prisma.companyWatchlist.update({
              where: { id: company.id },
              data: { lastScanned: new Date(), jobsFound: found.length },
            });
            await new Promise((r) => setTimeout(r, 300));
          }

          await prisma.vCSource.update({
            where: { id },
            data: {
              lastScanned: new Date(),
              companiesFound: companies.length,
              jobsFound: totalFound,
            },
          });
        }

        // Score and save new jobs
        if (newJobs.length > 0) {
          send({ type: "status", message: `Scoring ${newJobs.length} new jobs with AI...` });

          const scored = await batchScoreJobs(newJobs, {
            skills: profile.skills,
            targetRoles: profile.targetRoles,
            yearsExperience: profile.yearsExperience,
            preferRemote: profile.preferRemote,
            industries: profile.industries,
            summary: profile.summary,
          });

          send({ type: "status", message: "Saving results..." });

          await Promise.allSettled(
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
        }

        send({ type: "complete", newJobs: newJobs.length });
      } catch (err) {
        console.error("[sources/scan] Error:", err);
        send({ type: "error", error: err instanceof Error ? err.message : "Scan failed" });
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
