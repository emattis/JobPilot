import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const resumes = await prisma.resume.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        createdAt: true,
        rawText: false,
      },
    });
    return NextResponse.json({ success: true, data: resumes });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch resumes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const nameOverride = formData.get("name") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF text (require for CJS compatibility with serverExternalPackages)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const parsed = await pdfParse(buffer);
    const rawText = parsed.text.trim();

    if (!rawText) {
      return NextResponse.json(
        { success: false, error: "Could not extract text from PDF. Is it a scanned image?" },
        { status: 422 }
      );
    }

    // Determine user (solo-user: get or fail)
    const profile = await prisma.userProfile.findFirst();
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Please complete your profile before uploading a resume" },
        { status: 400 }
      );
    }

    // Build resume name from filename or override
    const baseName = nameOverride?.trim() ||
      file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");

    // If no default exists yet, make this one default
    const hasDefault = await prisma.resume.findFirst({ where: { userId: profile.id, isDefault: true } });

    const resume = await prisma.resume.create({
      data: {
        userId: profile.id,
        name: baseName,
        rawText,
        isDefault: !hasDefault,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: resume.id, name: resume.name, isDefault: resume.isDefault, charCount: rawText.length },
    });
  } catch (error) {
    console.error("Resume upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process resume" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

    const profile = await prisma.userProfile.findFirst();
    if (!profile) return NextResponse.json({ success: false, error: "No profile" }, { status: 400 });

    await prisma.resume.updateMany({
      where: { userId: profile.id },
      data: { isDefault: false },
    });
    await prisma.resume.update({ where: { id }, data: { isDefault: true } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

    await prisma.resume.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}
