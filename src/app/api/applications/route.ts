import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const applications = await prisma.application.findMany({
      include: {
        job: {
          include: {
            analyses: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { overallFitScore: true, shouldApply: true, id: true },
            },
          },
        },
        resume: { select: { id: true, name: true } },
        statusHistory: { orderBy: { changedAt: "asc" } },
        story: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: applications });
  } catch (err) {
    console.error("[applications] GET error:", err);
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, notes } = createSchema.parse(body);

    const profile = await prisma.userProfile.findFirst();
    if (!profile) {
      return NextResponse.json({ success: false, error: "No profile found" }, { status: 400 });
    }

    // Avoid duplicate applications for the same job
    const existing = await prisma.application.findFirst({
      where: { userId: profile.id, jobId },
    });
    if (existing) {
      return NextResponse.json({ success: true, data: existing, duplicate: true });
    }

    const application = await prisma.application.create({
      data: {
        userId: profile.id,
        jobId,
        resumeId: resumeId ?? null,
        notes: notes ?? null,
        status: "BOOKMARKED",
      },
    });

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Failed to create application" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Delete related records first, then the application
    await prisma.$transaction([
      prisma.statusChange.deleteMany({ where: { applicationId: id } }),
      prisma.referral.deleteMany({ where: { applicationId: id } }),
      prisma.story.deleteMany({ where: { applicationId: id } }),
      prisma.application.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, notes, followUpDate } = body as {
      id: string;
      status?: string;
      notes?: string;
      followUpDate?: string;
    };

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

    const current = await prisma.application.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const updated = await prisma.application.update({
      where: { id },
      data: {
        ...(status && { status: status as never }),
        ...(notes !== undefined && { notes }),
        ...(followUpDate && { followUpDate: new Date(followUpDate) }),
      },
    });

    if (status && status !== current.status) {
      await prisma.statusChange.create({
        data: {
          applicationId: id,
          fromStatus: current.status,
          toStatus: status as never,
        },
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}
