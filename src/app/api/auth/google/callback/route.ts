import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOAuth2Client } from "@/lib/google";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/profile?gmail=error", request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/profile?gmail=error", request.url));
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    await prisma.user.update({
      where: { id: state },
      data: {
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? null,
        googleTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
    });

    return NextResponse.redirect(new URL("/profile?gmail=connected", request.url));
  } catch (err) {
    console.error("[google/callback] Token exchange failed:", err);
    return NextResponse.redirect(new URL("/profile?gmail=error", request.url));
  }
}
