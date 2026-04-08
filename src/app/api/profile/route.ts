import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";

const profileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).default([]),
  yearsExperience: z.number().int().nonnegative().nullable().optional(),
  targetRoles: z.array(z.string()).default([]),
  targetCompanies: z.array(z.string()).default([]),
  minSalary: z.number().int().nonnegative().nullable().optional(),
  maxSalary: z.number().int().nonnegative().nullable().optional(),
  preferRemote: z.boolean().default(true),
  preferredLocations: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
});

export async function GET() {
  try {
    const session = await getSessionUser();
    if (session) {
      const profile = await prisma.userProfile.findUnique({ where: { id: session.profileId } });
      return NextResponse.json({ success: true, data: profile });
    }
    // No session with profile yet — check if any profile exists for the auth user
    // This handles the case before a profile is created
    return NextResponse.json({ success: true, data: null });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = profileSchema.parse(body);

    const session = await getSessionUser();
    const existing = session
      ? await prisma.userProfile.findUnique({ where: { id: session.profileId } })
      : null;

    const profile = existing
      ? await prisma.userProfile.update({
          where: { id: existing.id },
          data: {
            ...data,
            yearsExperience: data.yearsExperience ?? null,
            minSalary: data.minSalary ?? null,
            maxSalary: data.maxSalary ?? null,
          },
        })
      : await (async () => {
          const cookieStore = await cookies();
          const token = cookieStore.get(SESSION_COOKIE)?.value;
          if (!token) throw new Error("Not authenticated");
          const session = await prisma.session.findUnique({ where: { token } });
          if (!session || session.expiresAt < new Date()) throw new Error("Not authenticated");
          return prisma.userProfile.create({
            data: {
              ...data,
              authUserId: session.userId,
              yearsExperience: data.yearsExperience ?? null,
              minSalary: data.minSalary ?? null,
              maxSalary: data.maxSalary ?? null,
            },
          });
        })();

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to save profile" },
      { status: 500 }
    );
  }
}
