export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { orderId, allocations } = await request.json();

    if (!orderId || !allocations || !Array.isArray(allocations)) {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    // allocations array format:
    // [ { productId, locationId, qty, reason: "Order 1234" } ]

    // Process all deductions in a single transaction
    await prisma.$transaction(async (tx: any) => {
      for (const req of allocations) {
        const { productId, locationId, qty } = req;
        const numQty = parseInt(qty, 10);
        
        if (isNaN(numQty) || numQty <= 0) {
           throw new Error(`Invalid quantity ${qty} for product ${productId}`);
        }

        const inv = await tx.inventory.findUnique({
          where: { locationId_productId: { locationId, productId } }
        });

        if (!inv || inv.quantity < numQty) {
          throw new Error(`Insufficient stock for product ${productId} in location ${locationId}`);
        }

        await tx.inventory.update({
          where: { locationId_productId: { locationId, productId } },
          data: { quantity: inv.quantity - numQty }
        });

        await tx.inventoryLog.create({
          data: {
            locationId,
            productId,
            action: 'DEDUCT',
            quantity: numQty,
            reason: `Order ${orderId}`
          }
        });
      }
    }, { maxWait: 15000, timeout: 30000 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
