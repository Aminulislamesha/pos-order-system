export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { locationId, productId, action, quantity, reason } = await request.json();

    if (!locationId || !productId || !action || !quantity) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const numQty = parseInt(quantity, 10);
    if (isNaN(numQty) || numQty <= 0) {
      return NextResponse.json({ success: false, error: "Quantity must be a positive integer" }, { status: 400 });
    }

    // Run in a transaction to ensure log and inventory are updated together
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert Inventory record
      const existingInventory = await tx.inventory.findUnique({
        where: { locationId_productId: { locationId, productId } }
      });

      let newQuantity = numQty;
      if (existingInventory) {
        if (action === 'ADD') {
          newQuantity = existingInventory.quantity + numQty;
        } else if (action === 'DEDUCT') {
          newQuantity = existingInventory.quantity - numQty;
          if (newQuantity < 0) {
             throw new Error(`Insufficient stock. Only ${existingInventory.quantity} available.`);
          }
        }
      } else if (action === 'DEDUCT') {
        throw new Error(`Insufficient stock. 0 available.`);
      }

      const updatedInventory = await tx.inventory.upsert({
        where: { locationId_productId: { locationId, productId } },
        update: { quantity: newQuantity },
        create: { locationId, productId, quantity: newQuantity }
      });

      // 2. Create Log
      await tx.inventoryLog.create({
        data: {
          locationId,
          productId,
          action,
          quantity: numQty,
          reason
        }
      });

      return updatedInventory;
    }, { maxWait: 15000, timeout: 30000 });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
