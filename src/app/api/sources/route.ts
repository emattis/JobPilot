import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

// ── GET: list all sources ──────────────────────────────────────────────────

export async function GET() {
  try {
    const [companies, vcSources, profile] = await Promise.all([
      prisma.companyWatchlist.findMany({ orderBy: { name: "asc" } }),
      prisma.vCSource.findMany({ orderBy: { name: "asc" } }),
      prisma.userProfile.findFirst({
        select: { targetRoles: true, skills: true, yearsExperience: true, preferRemote: true, industries: true, summary: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { companies, vcSources },
      hasProfile: !!profile,
    });
  } catch (err) {
    console.error("[sources] GET error:", err);
    return NextResponse.json({ success: false, error: "Failed to fetch sources" }, { status: 500 });
  }
}

// ── POST: add a new source ─────────────────────────────────────────────────

const addSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(["vc_portfolio", "company_career", "job_board", "ats_board"]),
  atsType: z.enum(["greenhouse", "lever", "ashby", "workday", "custom", "auto"]).default("auto"),
});

function detectAtsType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("greenhouse.io") || lower.includes("boards-api.greenhouse")) return "greenhouse";
  if (lower.includes("lever.co") || lower.includes("api.lever.co")) return "lever";
  if (lower.includes("ashbyhq.com")) return "ashby";
  if (lower.includes("myworkday") || lower.includes("workday.com")) return "workday";
  return "custom";
}

function slugFromUrl(url: string, name: string): string {
  // Try to extract slug from known ATS URL patterns
  const ghMatch = url.match(/boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([^/?\s]+)/);
  if (ghMatch) return ghMatch[1];
  const lvMatch = url.match(/(?:jobs\.)?lever\.co\/([^/?\s]+)/);
  if (lvMatch) return lvMatch[1];
  const ashMatch = url.match(/jobs\.ashbyhq\.com\/([^/?\s]+)/);
  if (ashMatch) return ashMatch[1];
  // Fall back to slugified name
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, url, type, atsType } = addSchema.parse(body);

    const profile = await prisma.userProfile.findFirst({ select: { id: true } });
    if (!profile) {
      return NextResponse.json({ success: false, error: "Complete your profile first" }, { status: 400 });
    }

    if (type === "vc_portfolio" || type === "job_board") {
      const source = await prisma.vCSource.create({
        data: {
          userId: profile.id,
          name,
          portfolioUrl: url,
          scraperType: type,
        },
      });
      return NextResponse.json({ success: true, data: source, kind: "vc" });
    } else {
      const detectedAts = atsType === "auto" ? detectAtsType(url) : atsType;
      const slug = slugFromUrl(url, name);
      const source = await prisma.companyWatchlist.create({
        data: {
          userId: profile.id,
          name,
          slug,
          atsType: detectedAts,
          careerUrl: url,
        },
      });
      return NextResponse.json({ success: true, data: source, kind: "company" });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 });
    }
    console.error("[sources] POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to add source" }, { status: 500 });
  }
}

// ── PATCH: toggle active, update fields ─────────────────────────────────────

const patchSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["company", "vc"]),
  active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, kind, active } = patchSchema.parse(body);

    if (kind === "company") {
      const updated = await prisma.companyWatchlist.update({
        where: { id },
        data: { ...(active !== undefined && { active }) },
      });
      return NextResponse.json({ success: true, data: updated });
    } else {
      const updated = await prisma.vCSource.update({
        where: { id },
        data: { ...(active !== undefined && { active }) },
      });
      return NextResponse.json({ success: true, data: updated });
    }
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}

// ── DELETE: remove a source ────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const kind = searchParams.get("kind");
    if (!id || !kind) {
      return NextResponse.json({ success: false, error: "Missing id or kind" }, { status: 400 });
    }

    if (kind === "company") {
      await prisma.companyWatchlist.delete({ where: { id } });
    } else {
      await prisma.vCSource.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}
