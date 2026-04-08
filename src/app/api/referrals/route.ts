import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOutreachMessage } from "@/lib/ai/generate-outreach";

const createSchema = z.object({
  applicationId: z.string().min(1),
  contactName: z.string().min(1),
  contactRole: z.string().optional(),
  contactCompany: z.string().optional(),
  contactLinkedin: z.string().optional(),
  outreachType: z.enum(["WARM_INTRO", "COLD_OUTREACH", "ALUMNI", "HIRING_MANAGER", "RECRUITER", "EMPLOYEE"]).default("WARM_INTRO"),
  relationship: z.string().min(1),
});

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  messageTemplate: z.string().optional(),
  messageSentAt: z.string().nullable().optional(),
  responseReceivedAt: z.string().nullable().optional(),
  referralMade: z.boolean().optional(),
  referralDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  contactLinkedin: z.string().nullable().optional(),
});

// Include shape reused in GET responses
const referralInclude = {
  application: {
    select: {
      job: { select: { title: true, company: true } },
    },
  },
} as const;

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    const applicationId = request.nextUrl.searchParams.get("applicationId");

    const where = applicationId
      ? { applicationId, application: { userId: profileId } }
      : { application: { userId: profileId } };

    const referrals = await prisma.referral.findMany({
      where,
      include: referralInclude,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: referrals });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}

// ── POST — create + generate AI message ──────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[referrals POST] incoming body:", JSON.stringify(body, null, 2));
    const input = createSchema.parse(body);

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const profileId = session.profileId;

    // Load application + job for AI context
    const application = await prisma.application.findUnique({
      where: { id: input.applicationId },
      include: { job: { select: { title: true, company: true, description: true } } },
    });
    if (!application || application.userId !== profileId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { id: profileId },
      select: { id: true, name: true, summary: true },
    });

    // Get resume for AI context
    let resumeText: string | null = null;
    if (profile) {
      const resume = await prisma.resume.findFirst({
        where: { userId: profile.id, isDefault: true },
        select: { rawText: true },
      });
      resumeText = resume?.rawText ?? null;
    }

    // Generate outreach message
    let messageTemplate: string | null = null;
    try {
      messageTemplate = await generateOutreachMessage({
        contactName: input.contactName,
        contactRole: input.contactRole ?? null,
        contactCompany: input.contactCompany ?? null,
        outreachType: input.outreachType,
        relationship: input.relationship,
        jobTitle: application.job.title,
        jobCompany: application.job.company,
        jobDescription: application.job.description ?? null,
        candidateName: profile?.name ?? "I",
        candidateSummary: profile?.summary ?? null,
        resumeText,
      });
    } catch (aiErr) {
      console.error("[referrals] AI outreach generation failed:", aiErr);
    }

    const referral = await prisma.referral.create({
      data: {
        applicationId: input.applicationId,
        contactName: input.contactName,
        contactRole: input.contactRole ?? null,
        contactCompany: input.contactCompany ?? null,
        contactLinkedin: input.contactLinkedin ?? null,
        outreachType: input.outreachType,
        relationship: input.relationship,
        messageTemplate,
      },
      include: referralInclude,
    });

    return NextResponse.json({ success: true, data: referral });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[referrals POST] validation error:", error.issues);
      return NextResponse.json({ success: false, error: error.issues.map(i => i.message).join(", ") }, { status: 400 });
    }
    const errMsg = error instanceof Error ? error.message : "Failed to create";
    console.error("[referrals POST]", errMsg, error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...fields } = patchSchema.parse(body);

    const data: Record<string, unknown> = {};
    if (fields.status !== undefined) data.status = fields.status;
    if (fields.messageTemplate !== undefined) data.messageTemplate = fields.messageTemplate;
    if ("messageSentAt" in fields) data.messageSentAt = fields.messageSentAt ? new Date(fields.messageSentAt) : null;
    if ("responseReceivedAt" in fields) data.responseReceivedAt = fields.responseReceivedAt ? new Date(fields.responseReceivedAt) : null;
    if (fields.referralMade !== undefined) data.referralMade = fields.referralMade;
    if ("referralDate" in fields) data.referralDate = fields.referralDate ? new Date(fields.referralDate) : null;
    if ("notes" in fields) data.notes = fields.notes ?? null;
    if ("contactLinkedin" in fields) data.contactLinkedin = fields.contactLinkedin ?? null;

    const updated = await prisma.referral.update({
      where: { id },
      data,
      include: referralInclude,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    await prisma.referral.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}

// ── POST /api/referrals/regenerate ────────────────────────────────────────────
// Handled in separate route file below
