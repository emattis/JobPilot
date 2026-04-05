import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { generateResumePDF } from "@/lib/pdf/generate-resume";

// POST /api/resume/generate-pdf
// Body: { id: string }
// Generates a PDF from the resume's rawText, saves it, updates fileUrl, returns the resume.
export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string };
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    const resume = await prisma.resume.findUnique({ where: { id } });
    if (!resume) {
      return NextResponse.json({ success: false, error: "Resume not found" }, { status: 404 });
    }

    if (!resume.rawText?.trim()) {
      return NextResponse.json({ success: false, error: "No text content to generate PDF from" }, { status: 400 });
    }

    // Generate PDF buffer
    const pdfBuffer = await generateResumePDF(resume.rawText);

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "public", "resumes");
    await mkdir(uploadDir, { recursive: true });

    // Write file
    const filename = `${id}.pdf`;
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, pdfBuffer);

    // Update DB
    const fileUrl = `/resumes/${filename}`;
    const updated = await prisma.resume.update({
      where: { id },
      data: { fileUrl },
      select: { id: true, name: true, isDefault: true, createdAt: true, fileUrl: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[resume/generate-pdf] error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
