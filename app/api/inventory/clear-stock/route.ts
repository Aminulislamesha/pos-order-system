import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { confirmText } = await request.json();
    if (confirmText !== 'CLEAR STOCK') {
      return NextResponse.json({ success: false, error: 'Invalid confirmation text' }, { status: 400 });
    }

    await prisma.inventory.updateMany({
      data: { quantity: 0 }
    });

    return NextResponse.json({ success: true, message: 'All stock quantities reset to 0.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
