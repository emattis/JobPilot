import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOAuth2Client } from "@/lib/google";
import { createSession } from "@/lib/auth";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // "login" or a userId for re-auth
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/login?error=google_auth_failed", request.url));
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    // Get user info from Google
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: googleUser } = await oauth2.userinfo.get();

    if (!googleUser.email) {
      return NextResponse.redirect(new URL("/login?error=no_email", request.url));
    }

    const tokenData = {
      googleAccessToken: tokens.access_token ?? null,
      googleRefreshToken: tokens.refresh_token ?? null,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    };

    // If state is a userId (re-auth for an existing logged-in user)
    if (state && state !== "login") {
      await prisma.user.update({
        where: { id: state },
        data: tokenData,
      });
      return NextResponse.redirect(new URL("/?google=connected", request.url));
    }

    // Login flow: find or create user by email
    let user = await prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (user) {
      // Existing user — update tokens
      await prisma.user.update({
        where: { id: user.id },
        data: tokenData,
      });
    } else {
      // New user — create User + UserProfile
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          passwordHash: "__GOOGLE_AUTH__", // marker: no password, Google-only
          ...tokenData,
          profile: {
            create: {
              name: googleUser.name ?? googleUser.email.split("@")[0],
              email: googleUser.email,
            },
          },
        },
      });
    }

    // Create session
    await createSession(user.id);

    return NextResponse.redirect(new URL("/", request.url));
  } catch (err) {
    console.error("[google/callback] Error:", err);
    return NextResponse.redirect(new URL("/login?error=google_auth_failed", request.url));
  }
}
