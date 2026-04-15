import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const createSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    const applications = await prisma.application.findMany({
      where: { userId: profileId },
      include: {
        job: {
          include: {
            analyses: {
              orderBy: { createdAt: "desc" },
              take: 1,
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

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    const profile = await prisma.userProfile.findUnique({ where: { id: profileId } });
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

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (app.userId !== session.profileId) {
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

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const current = await prisma.application.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    if (current.userId !== session.profileId) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    // Auto-set timestamp fields on first transition to key statuses
    const timestampUpdates: Record<string, Date> = {};
    if (status && status !== current.status) {
      const now = new Date();

      if (status === "APPLIED" && !current.appliedAt) {
        timestampUpdates.appliedAt = now;
      }

      const interviewStatuses = [
        "SCREENING", "PHONE_INTERVIEW", "TECHNICAL_INTERVIEW",
        "ONSITE_INTERVIEW", "FINAL_ROUND",
      ];
      if (interviewStatuses.includes(status) && !current.interviewAt) {
        timestampUpdates.interviewAt = now;
      }

      if (status === "REJECTED" && !current.rejectedAt) {
        timestampUpdates.rejectedAt = now;
      }

      if ((status === "OFFER" || status === "ACCEPTED") && !current.offeredAt) {
        timestampUpdates.offeredAt = now;
      }

      if (status === "OFFER" || status === "ACCEPTED") {
        if (!current.responseAt) {
          timestampUpdates.responseAt = now;
        }
      }
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        ...(status && { status: status as never }),
        ...(notes !== undefined && { notes }),
        ...(followUpDate && { followUpDate: new Date(followUpDate) }),
        ...timestampUpdates,
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

    // Auto-create calendar event for interview stages
    let calendarEvent: { eventId: string; url: string } | null = null;
    const calendarStatuses = ["PHONE_INTERVIEW", "TECHNICAL_INTERVIEW", "ONSITE_INTERVIEW", "FINAL_ROUND"];
    if (status && calendarStatuses.includes(status) && !updated.calendarEventId) {
      try {
        const calRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/calendar`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: request.headers.get("cookie") ?? "",
            },
            body: JSON.stringify({ applicationId: id }),
          }
        );
        const calData = await calRes.json();
        if (calData.success && !calData.duplicate) {
          calendarEvent = { eventId: calData.eventId, url: calData.url };
        }
      } catch (err) {
        // Don't break the status change flow
        console.error("[applications PATCH] Calendar event creation failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: updated, calendarEvent });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}
