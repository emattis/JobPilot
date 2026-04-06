import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const saveSchema = z.object({
  discoveredJobId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { discoveredJobId } = saveSchema.parse(body);

    const profile = await prisma.userProfile.findFirst();
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "No profile found" },
        { status: 400 }
      );
    }

    const discoveredJob = await prisma.discoveredJob.findUnique({
      where: { id: discoveredJobId },
    });
    if (!discoveredJob) {
      return NextResponse.json(
        { success: false, error: "Discovered job not found" },
        { status: 404 }
      );
    }

    // Find or create the JobPosting from the discovered job data
    let jobPosting = await prisma.jobPosting.findUnique({
      where: { url: discoveredJob.url },
    });

    if (!jobPosting) {
      jobPosting = await prisma.jobPosting.create({
        data: {
          url: discoveredJob.url,
          title: discoveredJob.title,
          company: discoveredJob.company,
          location: discoveredJob.location,
          remote: discoveredJob.remote,
          source: discoveredJob.source,
          description: discoveredJob.reasoning ?? "",
          skills: [],
        },
      });
    }

    // Check for existing application
    const existing = await prisma.application.findFirst({
      where: { userId: profile.id, jobId: jobPosting.id },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        data: existing,
        duplicate: true,
      });
    }

    const application = await prisma.application.create({
      data: {
        userId: profile.id,
        jobId: jobPosting.id,
        status: "BOOKMARKED",
      },
    });

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to save to tracker" },
      { status: 500 }
    );
  }
}
