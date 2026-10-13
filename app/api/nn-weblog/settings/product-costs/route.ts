import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

export async function GET() {
  try {
    await ensureWeblogTables();
    const costs = await prisma.productCost.findMany({
      orderBy: [
        { base_product_name: "asc" },
        { effective_from: "asc" },
      ],
    });

    const baseProducts = await prisma.baseProduct.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      costs,
      availableBases: baseProducts.map((b) => b.name),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to load product costs";
    console.error("GET ProductCost error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureWeblogTables();
    const body = await request.json();
    const { id, base_product_name, cost, effective_from, effective_to, notes } = body;

    if (!base_product_name || typeof base_product_name !== "string") {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }

    const numCost = parseFloat(cost);
    if (isNaN(numCost) || numCost < 0) {
      return NextResponse.json({ error: "Valid making cost is required" }, { status: 400 });
    }

    const fromDate = effective_from ? new Date(effective_from) : null;
    const toDate = effective_to ? new Date(effective_to) : null;

    if (id) {
      // Update
      const updated = await prisma.productCost.update({
        where: { id },
        data: {
          base_product_name: base_product_name.trim(),
          cost: numCost,
          effective_from: fromDate,
          effective_to: toDate,
          notes: notes?.trim() || null,
        },
      });
      return NextResponse.json({ success: true, cost: updated });
    } else {
      // Create
      const created = await prisma.productCost.create({
        data: {
          base_product_name: base_product_name.trim(),
          cost: numCost,
          effective_from: fromDate,
          effective_to: toDate,
          notes: notes?.trim() || null,
        },
      });
      return NextResponse.json({ success: true, cost: created });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to save product cost";
    console.error("POST ProductCost error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureWeblogTables();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Cost ID is required" }, { status: 400 });
    }

    await prisma.productCost.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Cost configuration deleted" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to delete product cost";
    console.error("DELETE ProductCost error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
