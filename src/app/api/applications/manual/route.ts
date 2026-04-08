import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const schema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  url: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    const profile = await prisma.userProfile.findUnique({ where: { id: profileId } });
    if (!profile) {
      return NextResponse.json({ success: false, error: "No profile found" }, { status: 400 });
    }

    const url = input.url?.trim() || `manual://${input.company.toLowerCase().replace(/\s+/g, "-")}/${input.title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    const job = await prisma.jobPosting.upsert({
      where: { url },
      create: {
        url,
        title: input.title.trim(),
        company: input.company.trim(),
        location: input.location?.trim() ?? null,
        description: "Manually added",
        source: "manual",
      },
      update: {
        title: input.title.trim(),
        company: input.company.trim(),
      },
    });

    // Check for duplicate
    const existing = await prisma.application.findFirst({
      where: { userId: profile.id, jobId: job.id },
    });
    if (existing) {
      return NextResponse.json({ success: true, data: existing, duplicate: true });
    }

    const status = input.status || "APPLIED";

    const application = await prisma.application.create({
      data: {
        userId: profile.id,
        jobId: job.id,
        status: status as never,
        appliedAt: status !== "BOOKMARKED" ? new Date() : null,
        notes: input.notes?.trim() || null,
      },
      include: {
        job: {
          include: {
            analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { overallFitScore: true, shouldApply: true, id: true } },
          },
        },
        resume: { select: { id: true, name: true } },
        statusHistory: { orderBy: { changedAt: "asc" } },
      },
    });

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    console.error("[applications/manual POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create" }, { status: 500 });
  }
}
