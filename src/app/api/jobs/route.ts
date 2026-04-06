import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  id: z.string().min(1),
  url: z.string().url("Must be a valid URL"),
});

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, url } = patchSchema.parse(body);

    // Check no other job already has this URL
    const existing = await prisma.jobPosting.findFirst({
      where: { url, NOT: { id } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Another job posting already uses this URL" },
        { status: 409 }
      );
    }

    const updated = await prisma.jobPosting.update({
      where: { id },
      data: { url },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    console.error("[jobs PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}
