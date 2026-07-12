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
    const productItems = products.filter(p => p.type === 'PRODUCT');
    const totalProducts = productItems.length;
    const totalProductQuantity = productItems.reduce((acc, p) => 
      acc + p.inventory.reduce((sum, inv) => sum + inv.quantity, 0)
    , 0);

    // 2. Total Supplies & Quantity
    const supplyItems = products.filter(p => p.type === 'SUPPLY');
    const totalSupplies = supplyItems.length;
    const totalSupplyQuantity = supplyItems.reduce((acc, p) => 
      acc + p.inventory.reduce((sum, inv) => sum + inv.quantity, 0)
    , 0);

    // 3. Total Locations
    const totalLocations = locations.length;

    // 4. Low Stock (≤ 5 units total)
    const lowStockItems = products.map(p => {
      const totalQty = p.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        totalQty
      };
    }).filter(p => p.totalQty <= 5).sort((a, b) => a.totalQty - b.totalQty);

    // 5. Recently Updated Locations
    // Sort locations by the most recent inventory log
    const recentlyUpdatedLocations = locations
      .filter(l => l.logs.length > 0)
      .sort((a, b) => new Date(b.logs[0].createdAt).getTime() - new Date(a.logs[0].createdAt).getTime())
      .slice(0, 5)
      .map(l => ({
        id: l.id,
        name: l.name,
        lastUpdate: l.logs[0].createdAt
      }));

    return NextResponse.json({
      success: true,
      data: {
        totalProducts,
        totalProductQuantity,
        totalSupplies,
        totalSupplyQuantity,
        totalLocations,
        lowStockItems,
        recentlyUpdatedLocations
      }
    });
  } catch (error: any) {
    console.error('Dashboard Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
