import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendGmail } from "@/lib/google";

const sendSchema = z.object({
  referralId: z.string().min(1),
  subject: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { referralId, subject } = sendSchema.parse(body);

    // Check Gmail connection
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { googleAccessToken: true, googleRefreshToken: true },
    });
    if (!user?.googleAccessToken || !user?.googleRefreshToken) {
      return NextResponse.json(
        { success: false, error: "Gmail not connected", code: "GMAIL_NOT_CONNECTED" },
        { status: 400 }
      );
    }

    // Load referral with ownership check
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        application: { select: { userId: true } },
      },
    });
    if (!referral || referral.application.userId !== session.profileId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    if (!referral.contactEmail) {
      return NextResponse.json(
        { success: false, error: "No email address for this contact" },
        { status: 400 }
      );
    }

    if (!referral.messageTemplate) {
      return NextResponse.json(
        { success: false, error: "No message to send" },
        { status: 400 }
      );
    }

    // Send via Gmail
    await sendGmail(
      session.userId,
      referral.contactEmail,
      subject,
      referral.messageTemplate
    );

    // Update referral status
    const updated = await prisma.referral.update({
      where: { id: referralId },
      data: {
        status: "SENT",
        messageSentAt: new Date(),
      },
      include: {
        application: {
          select: { job: { select: { title: true, company: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    }
    console.error("[referrals/send] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to send" },
      { status: 500 }
    );
  }
}
