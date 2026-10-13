import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureWeblogTables();
    const { id } = await params;
    const body = await request.json();

    const existingOrder = await prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { returned_items, resolution_note, mark_resolved } = body;

    const updateData: Record<string, unknown> = {};

    if (returned_items !== undefined) {
      updateData.returned_items = returned_items;
    }

    if (mark_resolved === true) {
      updateData.requires_manual_review = false;
      updateData.manual_review_status = "RESOLVED";
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: "Order review saved successfully",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to review order";
    console.error("Order review API error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
