export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const locations = await prisma.location.findMany({
      include: {
        inventory: {
          include: {
            product: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    return NextResponse.json({ success: true, data: locations });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, notes } = await request.json();

    if (!name) {
      return NextResponse.json({ success: false, error: "Location name is required" }, { status: 400 });
    }

    const count = await prisma.location.count();
    const nextUid = `LOC-${String(count + 1).padStart(4, '0')}`;

    const newLoc = await prisma.location.create({
      data: {
        uid: nextUid,
        name: name.trim(),
        notes: notes ? notes.trim() : null
      }
    });

    return NextResponse.json({ success: true, data: newLoc });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: "A location with this name already exists." }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: "Location ID is required" }, { status: 400 });
    }

    // Check strict ledger constraint: total inventory must be 0
    const inventory = await prisma.inventory.findMany({
      where: { locationId: id }
    });
    
    const totalQty = inventory.reduce((sum: number, item: any) => sum + item.quantity, 0);
    
    if (totalQty > 0) {
      return NextResponse.json({ success: false, error: "Cannot delete location. It still contains ${totalQty} items in stock." }, { status: 400 });
    }

    await prisma.location.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
