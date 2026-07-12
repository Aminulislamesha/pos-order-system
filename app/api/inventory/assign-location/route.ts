export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { productId, locationId, locationName } = await request.json();

    if (!productId) {
      return NextResponse.json({ success: false, error: "Product ID is required" }, { status: 400 });
    }
    if (!locationId && !locationName) {
      return NextResponse.json({ success: false, error: "Either Location ID or Location Name is required" }, { status: 400 });
    }

    let finalLocationId = locationId;

    await prisma.$transaction(async (tx: any) => {
      // 1. Create location if it doesn't exist
      if (!finalLocationId && locationName) {
        const newLocation = await tx.location.create({
          data: {
            name: locationName,
            notes: "Created from product assignment"
          }
        });
        finalLocationId = newLocation.id;
      }

      // 2. Upsert inventory with 0 quantity if it doesn't exist
      await tx.inventory.upsert({
        where: { locationId_productId: { locationId: finalLocationId, productId } },
        update: {}, // Do nothing if it already exists
        create: {
          locationId: finalLocationId,
          productId: productId,
          quantity: 0
        }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
