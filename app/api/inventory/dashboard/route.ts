import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        inventory: true,
      }
    });

    const locations = await prisma.location.findMany({
      include: {
        inventory: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    // 1. Total Products & Quantity
    const productItems = products.filter((p: any) => p.type === 'PRODUCT');
    const totalProducts = productItems.length;
    const totalProductQuantity = productItems.reduce((acc: number, p: any) => 
      acc + p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0)
    , 0);

    // 2. Total Supplies & Quantity
    const supplyItems = products.filter((p: any) => p.type === 'SUPPLY');
    const totalSupplies = supplyItems.length;
    const totalSupplyQuantity = supplyItems.reduce((acc: number, p: any) => 
      acc + p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0)
    , 0);

    // 3. Total Locations
    const totalLocations = locations.length;

    // 4. Low Stock (≤ 5 units total)
    const lowStockItems = products.map((p: any) => {
      const totalQty = p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        totalQty
      };
    }).filter((p: any) => p.totalQty <= 5).sort((a: any, b: any) => a.totalQty - b.totalQty);

    // 5. Recently Updated Locations
    // Sort locations by the most recent inventory log
    const recentlyUpdatedLocations = locations
      .filter((l: any) => l.logs.length > 0)
      .sort((a: any, b: any) => new Date(b.logs[0].createdAt).getTime() - new Date(a.logs[0].createdAt).getTime())
      .slice(0, 5)
      .map((l: any) => ({
        id: l.id,
        name: l.name,
        lastUpdate: l.logs[0].createdAt
      }));

    // 6. Deduction History (Last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const deductionLogs = await prisma.inventoryLog.findMany({
      where: {
        createdAt: { gte: threeDaysAgo }
      },
      include: {
        product: true,
        location: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      data: {
        totalProducts,
        totalProductQuantity,
        totalSupplies,
        totalSupplyQuantity,
        totalLocations,
        lowStockItems,
        recentlyUpdatedLocations,
        deductionLogs
      }
    });
  } catch (error: any) {
    console.error('Dashboard Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
