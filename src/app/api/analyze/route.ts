import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { scrapeJobPosting, buildJobFromManual } from "@/lib/scrapers/job-posting";
import { scrapeCompanySite } from "@/lib/scrapers/company-site";
import { analyzeRole, analyzeCandidateFit } from "@/lib/ai/analyze-job";
import type { SseEvent, ScrapedJob, RoleAnalysisCache } from "@/types/analysis";

const bodySchema = z.object({
  jobUrl: z.string().url().optional(),
  companyUrl: z.string().optional(),
  resumeId: z.string().optional(),
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

        // ── Auth check ──────────────────────────────────────────────────────
        const session = await getSessionUser();
        if (!session) {
          send({ type: "error", error: "Unauthorized" });
          controller.close();
          return;
        }
        const profileId = session.profileId;

        // ── Load profile + resume ───────────────────────────────────────────
        const profile = await prisma.userProfile.findUnique({ where: { id: profileId } });
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

        // ── Check job cache ─────────────────────────────────────────────────
        let job: ScrapedJob;
        let roleCache: RoleAnalysisCache | null = null;
        let fromCache = false;
        let existingJobPosting = jobUrl
          ? await prisma.jobPosting.findUnique({ where: { url: jobUrl } })
          : null;

        if (manual) {
          // Manual entries are never cached
          job = buildJobFromManual(manual);
        } else if (existingJobPosting) {
          // Job exists in DB — reuse scraped data, skip re-fetching
          send({ type: "status", message: "Job found in cache — skipping scrape…" });

          job = {
            title: existingJobPosting.title,
            company: existingJobPosting.company,
            location: existingJobPosting.location,
            description: existingJobPosting.description,
            requirements: existingJobPosting.requirements,
            niceToHaves: existingJobPosting.niceToHaves,
            skills: existingJobPosting.skills,
            experienceLevel: existingJobPosting.experienceLevel,
            salaryMin: existingJobPosting.salaryMin,
            salaryMax: existingJobPosting.salaryMax,
            remote: existingJobPosting.remote,
            postedAt: existingJobPosting.postedAt,
            source: existingJobPosting.source,
          };

          // Check if role analysis is also cached
          if (existingJobPosting.roleAnalysisCache) {
            try {
              roleCache = JSON.parse(existingJobPosting.roleAnalysisCache) as RoleAnalysisCache;
              fromCache = true;
            } catch {
              roleCache = null; // corrupt cache — will re-run
            }
          }
        } else {
          // Fresh scrape
          send({ type: "status", message: "Scraping job posting…" });
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

        // ── Role analysis (Phase 1) — run only if not cached ────────────────
        if (!roleCache) {
          let companyInfo: string | null = null;
          if (companyUrl && !manual) {
            send({ type: "status", message: "Fetching company information…" });
            companyInfo = await scrapeCompanySite(companyUrl);
          }

          send({ type: "status", message: "Running role analysis…" });
          roleCache = await analyzeRole(job, companyInfo);

          // Persist job posting + role cache
          const upsertData = {
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
            roleAnalysisCache: JSON.stringify(roleCache),
            roleAnalysisCachedAt: new Date(),
          };

          existingJobPosting = await prisma.jobPosting.upsert({
            where: { url: jobUrl ?? `manual:${Date.now()}` },
            create: { url: jobUrl ?? `manual:${Date.now()}`, ...upsertData },
            update: { ...upsertData, scrapedAt: new Date() },
          });
        }

        // ── Candidate fit analysis (Phase 2) — always fresh ─────────────────
        send({
          type: "status",
          message: fromCache
            ? "Role data cached — running candidate fit analysis…"
            : "Running candidate fit analysis…",
        });

        const result = await analyzeCandidateFit(
          job,
          roleCache,
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

        // ── Ensure job posting record exists (manual case) ──────────────────
        if (!existingJobPosting) {
          existingJobPosting = await prisma.jobPosting.upsert({
            where: { url: `manual:${Date.now()}` },
            create: {
              url: `manual:${Date.now()}`,
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
              roleAnalysisCache: JSON.stringify(roleCache),
              roleAnalysisCachedAt: new Date(),
            },
            update: {},
          });
        }

        // ── Save analysis ───────────────────────────────────────────────────
        send({ type: "status", message: "Saving results…" });

        const analysis = await prisma.jobAnalysis.create({
          data: {
            userId: profile.id,
            jobId: existingJobPosting.id,
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
          jobId: existingJobPosting.id,
          result,
          job,
          fromCache,
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
