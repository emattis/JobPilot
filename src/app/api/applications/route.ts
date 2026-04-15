import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getCalendarClient } from "@/lib/google";

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
        const calendar = await getCalendarClient(session.userId);
        if (calendar) {
          // Load job + analysis + story for event description
          const appData = await prisma.application.findUnique({
            where: { id },
            include: {
              job: {
                include: {
                  analyses: {
                    where: { userId: session.profileId },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                },
              },
              story: true,
            },
          });

          if (appData) {
            const job = appData.job;
            const analysis = job.analyses[0];

            // Determine event time
            let eventStart: Date;
            if (appData.interviewAt) {
              eventStart = new Date(appData.interviewAt);
              eventStart.setHours(eventStart.getHours() - 24);
            } else {
              eventStart = new Date();
              eventStart.setDate(eventStart.getDate() + 1);
              eventStart.setHours(9, 0, 0, 0);
            }
            const eventEnd = new Date(eventStart);
            eventEnd.setHours(eventEnd.getHours() + 1);

            // Build description
            const descParts: string[] = [`Interview Prep for ${job.title} at ${job.company}`, ""];
            if (analysis) {
              descParts.push(`Fit Score: ${analysis.overallFitScore}%`);
              if (analysis.matchingSkills.length > 0) descParts.push(`Matching Skills: ${analysis.matchingSkills.join(", ")}`);
              if (analysis.missingSkills.length > 0) descParts.push(`Skills to Review: ${analysis.missingSkills.join(", ")}`);
              descParts.push("");
            }
            if (appData.story) {
              try {
                const tp = JSON.parse(appData.story.talkingPointsVersion);
                descParts.push("--- TALKING POINTS ---", "");
                if (tp.whyMe) descParts.push("WHY ME:", tp.whyMe, "");
                if (tp.whyThisCompany) descParts.push("WHY THIS COMPANY:", tp.whyThisCompany, "");
                if (tp.relevantBackground) descParts.push("MY BACKGROUND:", tp.relevantBackground, "");
              } catch { /* skip */ }
            }
            descParts.push(`View in JobPilot: ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/tracker`);

            const event = await calendar.events.insert({
              calendarId: "primary",
              requestBody: {
                summary: `${job.company} - ${job.title} Interview Prep`,
                description: descParts.join("\n"),
                start: { dateTime: eventStart.toISOString() },
                end: { dateTime: eventEnd.toISOString() },
                reminders: {
                  useDefault: false,
                  overrides: [{ method: "popup", minutes: 60 }, { method: "popup", minutes: 15 }],
                },
                colorId: "9",
              },
            });

            const eventId = event.data.id!;
            await prisma.application.update({ where: { id }, data: { calendarEventId: eventId } });
            calendarEvent = { eventId, url: event.data.htmlLink ?? "" };
          }
        }
      } catch (err) {
        console.error("[applications PATCH] Calendar event creation failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: updated, calendarEvent });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}
