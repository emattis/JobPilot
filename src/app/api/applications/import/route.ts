import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const rowSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  url: z.string().optional(),
  status: z.string().optional(),
  appliedAt: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
});

// Map common status strings to ApplicationStatus enum values
const STATUS_MAP: Record<string, string> = {
  bookmarked: "BOOKMARKED",
  saved: "BOOKMARKED",
  applied: "APPLIED",
  "ready to apply": "READY_TO_APPLY",
  screening: "SCREENING",
  "phone interview": "PHONE_INTERVIEW",
  "phone screen": "PHONE_INTERVIEW",
  "technical interview": "TECHNICAL_INTERVIEW",
  "onsite interview": "ONSITE_INTERVIEW",
  onsite: "ONSITE_INTERVIEW",
  "final round": "FINAL_ROUND",
  offer: "OFFER",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  withdrawn: "WITHDRAWN",
  ghosted: "GHOSTED",
  "no response": "GHOSTED",
};

function normalizeStatus(raw?: string): string {
  if (!raw) return "APPLIED";
  const key = raw.trim().toLowerCase();
  return STATUS_MAP[key] ?? "APPLIED";
}

function parseDate(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows } = importSchema.parse(body);

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    const profile = await prisma.userProfile.findUnique({ where: { id: profileId } });
    if (!profile) {
      return NextResponse.json({ success: false, error: "No profile found" }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Generate a stable URL if none provided
        const url = row.url?.trim() || `manual://${row.company.toLowerCase().replace(/\s+/g, "-")}/${row.title.toLowerCase().replace(/\s+/g, "-")}`;

        // Upsert JobPosting
        const job = await prisma.jobPosting.upsert({
          where: { url },
          create: {
            url,
            title: row.title.trim(),
            company: row.company.trim(),
            location: row.location?.trim() ?? null,
            description: "Imported via CSV/XLSX",
            source: row.url ? "manual" : "import",
          },
          update: {
            title: row.title.trim(),
            company: row.company.trim(),
            ...(row.location && { location: row.location.trim() }),
          },
        });

        // Check for existing application
        const existing = await prisma.application.findFirst({
          where: { userId: profile.id, jobId: job.id },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const status = normalizeStatus(row.status);
        const appliedAt = parseDate(row.appliedAt);

        await prisma.application.create({
          data: {
            userId: profile.id,
            jobId: job.id,
            status: status as never,
            appliedAt: appliedAt ?? (status !== "BOOKMARKED" ? new Date() : null),
            notes: row.notes?.trim() || null,
          },
        });

        created++;
      } catch (err) {
        errors.push(`${row.company} - ${row.title}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, skipped, errors: errors.slice(0, 10) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    console.error("[applications/import POST]", error);
    return NextResponse.json({ success: false, error: "Import failed" }, { status: 500 });
  }
}
