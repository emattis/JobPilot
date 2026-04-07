import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateOutreachMessage } from "@/lib/ai/generate-outreach";

export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string };
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        application: { include: { job: { select: { title: true, company: true, description: true } } } },
      },
    });
    if (!referral) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const profile = await prisma.userProfile.findFirst({ select: { id: true, name: true, summary: true } });

    let resumeText: string | null = null;
    if (profile) {
      const resume = await prisma.resume.findFirst({
        where: { userId: profile.id, isDefault: true },
        select: { rawText: true },
      });
      resumeText = resume?.rawText ?? null;
    }

    const messageTemplate = await generateOutreachMessage({
      contactName: referral.contactName,
      contactRole: referral.contactRole,
      contactCompany: referral.contactCompany,
      outreachType: referral.outreachType,
      relationship: referral.relationship,
      jobTitle: referral.application.job.title,
      jobCompany: referral.application.job.company,
      jobDescription: referral.application.job.description ?? null,
      candidateName: profile?.name ?? "I",
      candidateSummary: profile?.summary ?? null,
      resumeText,
    });

    const updated = await prisma.referral.update({
      where: { id },
      data: { messageTemplate },
      include: {
        application: { select: { job: { select: { title: true, company: true } } } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[referrals/regenerate]", err);
    return NextResponse.json({ success: false, error: "Failed to regenerate" }, { status: 500 });
  }
}
