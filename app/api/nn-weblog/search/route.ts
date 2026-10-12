import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ customers: [], orders: [] });
  }

  try {
    const [customers, orders] = await Promise.all([
      prisma.customer.findMany({
        where: {
          OR: [
            { phone: { contains: q } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { orders: true } },
        },
      }),
      prisma.order.findMany({
        where: {
          invoice_id: { contains: q, mode: "insensitive" },
        },
        take: 10,
        orderBy: { date: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
        },
      }),
    ]);

    return NextResponse.json({
      customers,
      orders,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
