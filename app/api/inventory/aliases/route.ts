export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { alias, productId } = await request.json();

    if (!alias || !productId) {
      return NextResponse.json({ success: false, error: "Alias and productId are required" }, { status: 400 });
    }

    const newAlias = await prisma.productAlias.create({
      data: {
        alias: alias.trim(),
        productId,
      }
    });

    return NextResponse.json({ success: true, data: newAlias });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: "This alias is already mapped." }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: "Alias ID is required" }, { status: 400 });
        }

        await prisma.productAlias.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
