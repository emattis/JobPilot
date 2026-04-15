import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google";
import { prisma } from "@/lib/db";

// GET: check gmail connection status
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { googleAccessToken: true, googleRefreshToken: true },
  });

  return NextResponse.json({
    success: true,
    connected: !!(user?.googleAccessToken && user?.googleRefreshToken),
  });
}

// POST: initiate OAuth flow
export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = getAuthUrl(session.userId);
  return NextResponse.json({ success: true, url });
}

// DELETE: disconnect Gmail
export async function DELETE() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
    },
  });

  return NextResponse.json({ success: true });
}
