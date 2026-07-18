import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { confirmText } = await request.json();
    if (confirmText !== 'FACTORY RESET') {
      return NextResponse.json({ success: false, error: 'Invalid confirmation text' }, { status: 400 });
    }

    // Delete in correct order to respect foreign key constraints (though onDelete: Cascade helps)
    await prisma.$transaction([
      prisma.inventoryLog.deleteMany({}),
      prisma.inventory.deleteMany({}),
      prisma.productAlias.deleteMany({}),
      prisma.product.deleteMany({}),
      prisma.location.deleteMany({}),
    ]);

    return NextResponse.json({ success: true, message: 'Inventory reset successfully.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
