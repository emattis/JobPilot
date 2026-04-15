import { google } from "googleapis";
import { prisma } from "@/lib/db";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const ALL_SCOPES = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
];

export function getAuthUrl(state?: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ALL_SCOPES,
    state: state ?? "login",
  });
}

async function getAuthenticatedClient(authUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: authUserId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  });

  if (!user?.googleAccessToken || !user?.googleRefreshToken) {
    return null;
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime(),
  });

  client.on("tokens", async (tokens) => {
    await prisma.user.update({
      where: { id: authUserId },
      data: {
        ...(tokens.access_token && { googleAccessToken: tokens.access_token }),
        ...(tokens.expiry_date && {
          googleTokenExpiry: new Date(tokens.expiry_date),
        }),
      },
    });
  });

  return client;
}

export async function getGmailClient(authUserId: string) {
  const client = await getAuthenticatedClient(authUserId);
  if (!client) return null;
  return google.gmail({ version: "v1", auth: client });
}

export async function getSheetsClient(authUserId: string) {
  const client = await getAuthenticatedClient(authUserId);
  if (!client) return null;
  return google.sheets({ version: "v4", auth: client });
}

export async function sendGmail(
  authUserId: string,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const gmail = await getGmailClient(authUserId);
  if (!gmail) throw new Error("Gmail not connected");

  // Build RFC 2822 message
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });
}
