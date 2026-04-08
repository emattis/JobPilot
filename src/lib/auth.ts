import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "jobpilot_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

// ── Password hashing ────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  // Support the placeholder from migration
  if (hash === "__NEEDS_PASSWORD_RESET__") return false;
  return bcrypt.compare(password, hash);
}

// ── Session management ──────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
  }

  cookieStore.delete(SESSION_COOKIE);
}

// ── Auth checks ─────────────────────────────────────────────────────────────

export async function getSessionUser(): Promise<{
  userId: string;
  profileId: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { profile: { select: { id: true } } },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  if (!session.user.profile) return null;

  return {
    userId: session.userId,
    profileId: session.user.profile.id,
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getSessionUser();
  return user !== null;
}

export async function requireAuth(): Promise<{
  userId: string;
  profileId: string;
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// ── Middleware helper (checks cookie existence only — no DB call) ────────────

export function hasSessionCookie(cookieValue: string | undefined): boolean {
  return !!cookieValue && cookieValue.length >= 32;
}

export { SESSION_COOKIE };
