import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    // Single resume with rawText (for preview)
    if (id) {
      const resume = await prisma.resume.findUnique({
        where: { id },
        select: { id: true, name: true, isDefault: true, createdAt: true, rawText: true, fileUrl: true },
      });
      if (!resume) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: resume });
    }

    // All resumes (list — no rawText)
    const resumes = await prisma.resume.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, isDefault: true, createdAt: true },
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
    const rawTextOverride = formData.get("rawText") as string | null;

    // ── Text-only save (tailored resume from AI optimization) ──────────────
    if (!file && rawTextOverride) {
      const profile = await prisma.userProfile.findFirst();
      if (!profile) {
        return NextResponse.json({ success: false, error: "No profile found" }, { status: 400 });
      }
      const name = nameOverride?.trim() || "Tailored Resume";
      const resume = await prisma.resume.create({
        data: { userId: profile.id, name, rawText: rawTextOverride, isDefault: false },
      });
      return NextResponse.json({
        success: true,
        data: { id: resume.id, name: resume.name, isDefault: resume.isDefault, charCount: rawTextOverride.length },
      });
    }

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

    // pdf-parse v2 class-based API
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require("pdf-parse") as {
      PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> };
    };
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
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

    // Create DB record first to get the ID
    const resume = await prisma.resume.create({
      data: {
        userId: profile.id,
        name: baseName,
        rawText,
        isDefault: !hasDefault,
      },
    });

    // Save original PDF file using the record ID as filename
    try {
      const uploadDir = path.join(process.cwd(), "public", "resumes");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, `${resume.id}.pdf`), buffer);
      await prisma.resume.update({
        where: { id: resume.id },
        data: { fileUrl: `/resumes/${resume.id}.pdf` },
      });
    } catch (fsErr) {
      // Non-fatal: text extraction succeeded; PDF storage failure is logged but doesn't fail the upload
      console.error("[resume upload] Failed to save PDF file:", fsErr);
    }

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
