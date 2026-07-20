export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { locationId, baseName, updates } = await request.json();

    if (!locationId || !baseName || !updates || !Array.isArray(updates)) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    if (updates.length === 0) {
       return NextResponse.json({ success: true, message: "No updates provided" });
    }

    const uniqueColors = Array.from(new Set(updates.map((u: any) => String(u.color).trim())));
    const uniqueSizes = Array.from(new Set(updates.map((u: any) => String(u.size).trim())));
    const trimmedBaseName = baseName.trim();

    // 1. Dictionary Upserts (Optimized to reduce connection usage)
    await prisma.baseProduct.upsert({
      where: { name: trimmedBaseName },
      update: {},
      create: { name: trimmedBaseName, aliases: [] }
    });

    if (uniqueColors.length > 0) {
      await prisma.color.createMany({
        data: uniqueColors.map(c => ({ name: c, aliases: [] })),
        skipDuplicates: true
      });
    }

    if (uniqueSizes.length > 0) {
      await prisma.size.createMany({
        data: uniqueSizes.map(s => ({ name: s, aliases: [] })),
        skipDuplicates: true
      });
    }

    // 2. Pre-fetch and create products (Outside transaction)
    const productNames = updates.map((u: any) => `${trimmedBaseName} - ${String(u.color).trim()} / ${String(u.size).trim()}`);
    let existingProducts = await prisma.product.findMany({
      where: { name: { in: productNames } }
    });

    const existingNames = new Set(existingProducts.map(p => p.name));
    const missingNames = productNames.filter((n: string) => !existingNames.has(n));

    if (missingNames.length > 0) {
      await prisma.product.createMany({
        data: missingNames.map((name: string) => ({ name, type: "PRODUCT" })),
        skipDuplicates: true
      });
      // Re-fetch to get the new IDs
      existingProducts = await prisma.product.findMany({
        where: { name: { in: productNames } }
      });
    }

    const productMap = new Map(existingProducts.map(p => [p.name, p.id]));

    // 3. Process inventory inside an optimized transaction
    const result = await prisma.$transaction(async (tx: any) => {
      let count = 0;

      for (const update of updates) {
        const { color, size, quantity } = update;
        const productNameSlash = `${trimmedBaseName} - ${String(color).trim()} / ${String(size).trim()}`;
        const productId = productMap.get(productNameSlash);
        
        if (!productId) continue;

        const numQty = parseInt(quantity, 10);
        if (isNaN(numQty) || numQty === 0) continue; // 0 or empty means no stock change, but product is now created!

        // Upsert inventory (Additive)
        const existingInventory = await tx.inventory.findUnique({
          where: { locationId_productId: { locationId, productId } }
        });

        const oldQuantity = existingInventory?.quantity || 0;
        const newQuantity = oldQuantity + numQty;

        if (newQuantity < 0) {
          throw new Error(`Cannot deduct ${Math.abs(numQty)} from ${productNameSlash}. Only ${oldQuantity} in stock.`);
        }

        await tx.inventory.upsert({
          where: { locationId_productId: { locationId, productId } },
          update: { quantity: newQuantity },
          create: { locationId, productId, quantity: newQuantity }
        });

        const action = numQty > 0 ? 'ADD' : 'DEDUCT';

        // Create Log
        await tx.inventoryLog.create({
          data: {
            locationId,
            productId,
            action: action,
            quantity: Math.abs(numQty),
            reason: 'Matrix Stock Update'
          }
        });

        count++;
      }

      return { count };
    }, { maxWait: 15000, timeout: 30000 });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
