import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getSheetsClient } from "@/lib/google";
import { format } from "date-fns";

const SHEET_TITLE = "JobPilot - Application Tracker";

const HEADERS = [
  "Company",
  "Role",
  "Status",
  "Fit Score",
  "Date Applied",
  "Source",
  "Location",
  "Outreach Status",
  "Follow-up Date",
  "Notes",
  "Job URL",
];

const STATUS_LABELS: Record<string, string> = {
  BOOKMARKED: "Bookmarked",
  ANALYZING: "Analyzing",
  READY_TO_APPLY: "Ready to Apply",
  APPLIED: "Applied",
  SCREENING: "Screening",
  PHONE_INTERVIEW: "Phone Interview",
  TECHNICAL_INTERVIEW: "Technical Interview",
  ONSITE_INTERVIEW: "Onsite Interview",
  FINAL_ROUND: "Final Round",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  GHOSTED: "Ghosted",
};

// Color mapping for status cells (RGB 0-1)
function statusColor(status: string): { red: number; green: number; blue: number } | null {
  switch (status) {
    case "OFFER":
    case "ACCEPTED":
      return { red: 0.14, green: 0.64, blue: 0.25 }; // green
    case "REJECTED":
      return { red: 0.82, green: 0.18, blue: 0.18 }; // red
    case "SCREENING":
    case "PHONE_INTERVIEW":
    case "TECHNICAL_INTERVIEW":
    case "ONSITE_INTERVIEW":
    case "FINAL_ROUND":
      return { red: 0.23, green: 0.51, blue: 0.96 }; // blue
    case "BOOKMARKED":
    case "GHOSTED":
    case "WITHDRAWN":
      return { red: 0.6, green: 0.6, blue: 0.6 }; // gray
    default:
      return null;
  }
}

export async function POST() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const sheets = await getSheetsClient(session.userId);
    if (!sheets) {
      return NextResponse.json(
        { success: false, error: "Google not connected", code: "GOOGLE_NOT_CONNECTED" },
        { status: 400 }
      );
    }

    const profileId = session.profileId;

    // Load applications
    const applications = await prisma.application.findMany({
      where: { userId: profileId },
      include: {
        job: {
          include: {
            analyses: {
              where: { userId: profileId },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { overallFitScore: true },
            },
          },
        },
        referrals: {
          select: { status: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build rows
    const rows = applications.map((app) => {
      const fitScore = app.job.analyses[0]?.overallFitScore ?? null;
      const outreachStatus = app.referrals[0]?.status ?? "";
      return [
        app.job.company,
        app.job.title,
        STATUS_LABELS[app.status] ?? app.status,
        fitScore !== null ? `${fitScore}%` : "",
        app.appliedAt ? format(new Date(app.appliedAt), "yyyy-MM-dd") : "",
        app.job.source,
        app.job.location ?? "",
        outreachStatus ? STATUS_LABELS[outreachStatus] ?? outreachStatus : "",
        app.followUpDate ? format(new Date(app.followUpDate), "yyyy-MM-dd") : "",
        app.notes ?? "",
        app.job.url.startsWith("manual://") ? "" : app.job.url,
      ];
    });

    const allData = [HEADERS, ...rows];

    // Check if we have an existing sheet
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { googleSheetId: true },
    });

    let spreadsheetId = user?.googleSheetId ?? null;

    // Try to update existing sheet
    if (spreadsheetId) {
      try {
        await sheets.spreadsheets.get({ spreadsheetId });
      } catch {
        // Sheet was deleted or inaccessible — create a new one
        spreadsheetId = null;
      }
    }

    if (!spreadsheetId) {
      // Create new spreadsheet
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: SHEET_TITLE },
          sheets: [
            {
              properties: {
                title: "Applications",
                gridProperties: { frozenRowCount: 1 },
              },
            },
          ],
        },
      });

      spreadsheetId = createRes.data.spreadsheetId!;

      // Save the sheet ID
      await prisma.user.update({
        where: { id: session.userId },
        data: { googleSheetId: spreadsheetId },
      });
    }

    // Clear existing data and write new data
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "Applications!A:K",
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Applications!A1",
      valueInputOption: "RAW",
      requestBody: { values: allData },
    });

    // Get the sheet ID for formatting
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = sheetMeta.data.sheets?.[0]?.properties?.sheetId ?? 0;

    // Format: bold header, auto-resize, status colors
    const requests: object[] = [
      // Bold header row
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.15, green: 0.15, blue: 0.15 },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)",
        },
      },
      // Header text color (white)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      },
      // Auto-resize columns
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: HEADERS.length,
          },
        },
      },
    ];

    // Color-code status cells (column C, index 2)
    rows.forEach((row, i) => {
      const status = applications[i].status;
      const color = statusColor(status);
      if (color) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: i + 1,
              endRowIndex: i + 2,
              startColumnIndex: 2,
              endColumnIndex: 3,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { ...color, alpha: 0.2 },
                textFormat: {
                  foregroundColor: color,
                  bold: true,
                },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        });
      }
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    return NextResponse.json({
      success: true,
      spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      count: applications.length,
    });
  } catch (err) {
    console.error("[sheets/sync] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
