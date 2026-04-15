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
    const { id, status, notes, followUpDate, interviewAt, timezone } = body as {
      id: string;
      status?: string;
      notes?: string;
      followUpDate?: string;
      interviewAt?: string;
      timezone?: string;
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

      // Any status at or past APPLIED implies the user applied
      const appliedAndBeyond = [
        "APPLIED", "SCREENING", "PHONE_INTERVIEW", "TECHNICAL_INTERVIEW",
        "ONSITE_INTERVIEW", "FINAL_ROUND", "OFFER", "ACCEPTED", "REJECTED",
      ];
      if (appliedAndBeyond.includes(status) && !current.appliedAt) {
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
        ...(interviewAt !== undefined && { interviewAt: interviewAt ? new Date(interviewAt) : null }),
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

    // Calendar event logic
    let calendarEvent: { eventId: string; url: string } | null = null;
    let calendarHint: string | null = null;
    const tz = timezone ?? "America/New_York";

    const calendarStatuses = ["PHONE_INTERVIEW", "TECHNICAL_INTERVIEW", "ONSITE_INTERVIEW", "FINAL_ROUND"];
    const isInterviewStatus = status && calendarStatuses.includes(status);
    const interviewDateChanged = interviewAt !== undefined && interviewAt !== "";

    // Determine if we need to create or update a calendar event
    const effectiveInterviewAt = interviewDateChanged
      ? new Date(interviewAt!)
      : updated.interviewAt;

    // Create event on interview status change (with or without interview date)
    const needsNewEvent = (isInterviewStatus || (effectiveInterviewAt && !updated.calendarEventId)) && !updated.calendarEventId;
    const needsEventUpdate = interviewDateChanged && updated.calendarEventId;

    if (needsNewEvent || needsEventUpdate) {
      try {
        const calendar = await getCalendarClient(session.userId);
        if (calendar) {
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

            // Prep event: 24h before interview if set, otherwise tomorrow 9am
            let eventStart: Date;
            if (effectiveInterviewAt) {
              eventStart = new Date(effectiveInterviewAt.getTime() - 24 * 60 * 60 * 1000);
            } else {
              eventStart = new Date();
              eventStart.setDate(eventStart.getDate() + 1);
              eventStart.setHours(9, 0, 0, 0);
            }
            const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

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

            const eventBody = {
              summary: `${job.company} - ${job.title} Interview Prep`,
              description: descParts.join("\n"),
              start: { dateTime: eventStart.toISOString(), timeZone: tz },
              end: { dateTime: eventEnd.toISOString(), timeZone: tz },
              reminders: {
                useDefault: false,
                overrides: [{ method: "popup" as const, minutes: 60 }, { method: "popup" as const, minutes: 15 }],
              },
              colorId: "9",
            };

            if (needsEventUpdate && updated.calendarEventId) {
              const event = await calendar.events.update({
                calendarId: "primary",
                eventId: updated.calendarEventId,
                requestBody: eventBody,
              });
              calendarEvent = { eventId: updated.calendarEventId, url: event.data.htmlLink ?? "" };
            } else if (needsNewEvent) {
              const event = await calendar.events.insert({
                calendarId: "primary",
                requestBody: eventBody,
              });
              const eventId = event.data.id!;
              await prisma.application.update({ where: { id }, data: { calendarEventId: eventId } });
              calendarEvent = { eventId, url: event.data.htmlLink ?? "" };
            }
          }
        }
      } catch (err) {
        console.error("[applications PATCH] Calendar event error:", err);
      }
    }

    return NextResponse.json({ success: true, data: updated, calendarEvent, calendarHint });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}
