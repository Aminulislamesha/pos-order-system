import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        is_followed_up: true,
        last_follow_up_date: new Date(),
      },
    });

    return NextResponse.json({ success: true, customer });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to mark customer as followed up";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
