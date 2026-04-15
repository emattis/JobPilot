import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getCalendarClient } from "@/lib/google";

const createEventSchema = z.object({
  applicationId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { applicationId } = createEventSchema.parse(body);

    // Load application with job, analysis, and story
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
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

    if (!application || application.userId !== session.profileId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Don't create duplicate events
    if (application.calendarEventId) {
      return NextResponse.json({
        success: true,
        eventId: application.calendarEventId,
        url: `https://calendar.google.com/calendar/event?eid=${Buffer.from(application.calendarEventId).toString("base64")}`,
        duplicate: true,
      });
    }

    const calendar = await getCalendarClient(session.userId);
    if (!calendar) {
      return NextResponse.json(
        { success: false, error: "Google not connected", code: "GOOGLE_NOT_CONNECTED" },
        { status: 400 }
      );
    }

    const job = application.job;
    const analysis = job.analyses[0];

    // Determine event time
    let eventStart: Date;
    if (application.interviewAt) {
      // 24 hours before the interview
      eventStart = new Date(application.interviewAt);
      eventStart.setHours(eventStart.getHours() - 24);
    } else {
      // Next day at 9am
      eventStart = new Date();
      eventStart.setDate(eventStart.getDate() + 1);
      eventStart.setHours(9, 0, 0, 0);
    }

    const eventEnd = new Date(eventStart);
    eventEnd.setHours(eventEnd.getHours() + 1);

    // Build description
    const descParts: string[] = [];
    descParts.push(`Interview Prep for ${job.title} at ${job.company}`);
    descParts.push("");

    if (analysis) {
      descParts.push(`Fit Score: ${analysis.overallFitScore}%`);
      if (analysis.matchingSkills.length > 0) {
        descParts.push(`Matching Skills: ${analysis.matchingSkills.join(", ")}`);
      }
      if (analysis.missingSkills.length > 0) {
        descParts.push(`Skills to Review: ${analysis.missingSkills.join(", ")}`);
      }
      descParts.push("");
    }

    // Include talking points from My Story if available
    if (application.story) {
      try {
        const talkingPoints = JSON.parse(application.story.talkingPointsVersion);
        descParts.push("--- TALKING POINTS ---");
        descParts.push("");
        if (talkingPoints.whyMe) {
          descParts.push("WHY ME:");
          descParts.push(talkingPoints.whyMe);
          descParts.push("");
        }
        if (talkingPoints.whyThisCompany) {
          descParts.push("WHY THIS COMPANY:");
          descParts.push(talkingPoints.whyThisCompany);
          descParts.push("");
        }
        if (talkingPoints.relevantBackground) {
          descParts.push("MY BACKGROUND:");
          descParts.push(talkingPoints.relevantBackground);
          descParts.push("");
        }
        if (talkingPoints.whatIHopeToContribute) {
          descParts.push("WHAT I'LL CONTRIBUTE:");
          descParts.push(talkingPoints.whatIHopeToContribute);
          descParts.push("");
        }
        if (talkingPoints.howIllMakeAnImpact) {
          descParts.push("HOW I'LL MAKE AN IMPACT:");
          descParts.push(talkingPoints.howIllMakeAnImpact);
          descParts.push("");
        }
      } catch {
        // Skip if JSON parse fails
      }
    }

    const appUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/tracker`;
    descParts.push(`View in JobPilot: ${appUrl}`);

    const description = descParts.join("\n");

    // Create the event
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `${job.company} - ${job.title} Interview Prep`,
        description,
        start: {
          dateTime: eventStart.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: eventEnd.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 60 },
            { method: "popup", minutes: 15 },
          ],
        },
        colorId: "9", // blueberry
      },
    });

    const eventId = event.data.id!;

    // Save event ID on application
    await prisma.application.update({
      where: { id: applicationId },
      data: { calendarEventId: eventId },
    });

    return NextResponse.json({
      success: true,
      eventId,
      url: event.data.htmlLink,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    }
    console.error("[calendar/create-event] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
