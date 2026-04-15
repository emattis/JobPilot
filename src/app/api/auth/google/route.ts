import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google";
import { prisma } from "@/lib/db";

// GET: check Google connection status
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

// POST: get OAuth URL (for login page or re-auth)
export async function POST() {
  // Check if already logged in (re-auth to refresh scopes)
  const session = await getSessionUser();
  const url = getAuthUrl(session?.userId);
  return NextResponse.json({ success: true, url });
}

// DELETE: disconnect Google services (keeps account, clears tokens)
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
