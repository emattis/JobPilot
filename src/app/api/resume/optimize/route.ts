import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { optimizeResume } from "@/lib/ai/resume-optimize";

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// POST /api/resume/optimize
// Body: { resumeId: string, applicationId: string }
// Streams SSE: { type: "token", text } | { type: "complete", result } | { type: "error", error }
export async function POST(request: NextRequest) {
  const { resumeId, applicationId } = await request.json() as {
    resumeId: string;
    applicationId: string;
  };

  if (!resumeId || !applicationId) {
    return NextResponse.json({ success: false, error: "Missing resumeId or applicationId" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sse(event)));

      try {
        const session = await getSessionUser();
        if (!session) {
          send({ type: "error", error: "Unauthorized" });
          controller.close();
          return;
        }

        // Load resume
        const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
        if (!resume || resume.userId !== session.profileId) {
          send({ type: "error", error: "Resume not found" });
          controller.close();
          return;
        }

        // Load application → job posting
        const application = await prisma.application.findUnique({
          where: { id: applicationId },
          include: {
            job: {
              select: {
                title: true,
                company: true,
                description: true,
                requirements: true,
              },
            },
          },
        });
        if (!application || application.userId !== session.profileId) {
          send({ type: "error", error: "Application not found" });
          controller.close();
          return;
        }

        send({ type: "status", message: `Optimizing resume for ${application.job.title} at ${application.job.company}…` });

        const result = await optimizeResume(
          resume.rawText,
          application.job,
          (token) => send({ type: "token", text: token })
        );

        send({ type: "complete", result });
      } catch (err) {
        console.error("[resume/optimize] error:", err);
        send({ type: "error", error: err instanceof Error ? err.message : "Optimization failed" });
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

// GET /api/resume/optimize?resumeId=xxx
// Returns the rawText of a resume (for preview)
export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const resumeId = request.nextUrl.searchParams.get("resumeId");
  if (!resumeId) {
    return NextResponse.json({ success: false, error: "Missing resumeId" }, { status: 400 });
  }
  try {
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: { id: true, name: true, rawText: true, userId: true },
    });
    if (!resume || resume.userId !== session.profileId) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: resume });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}
