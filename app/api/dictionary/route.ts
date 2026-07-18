import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    let data;
    switch (type) {
      case 'base':
        data = await prisma.baseProduct.findMany({ orderBy: { name: 'asc' } });
        break;
      case 'color':
        data = await prisma.color.findMany({ orderBy: { name: 'asc' } });
        break;
      case 'size':
        data = await prisma.size.findMany({ orderBy: { name: 'asc' } });
        break;
      default:
        return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { type, action, name, aliases } = await request.json();
    
    if (!type || !name) {
      return NextResponse.json({ success: false, error: 'Missing type or name' }, { status: 400 });
    }

    let model: any;
    switch (type) {
      case 'base': model = prisma.baseProduct; break;
      case 'color': model = prisma.color; break;
      case 'size': model = prisma.size; break;
      default: return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }

    if (action === 'update_aliases') {
      const cleanName = name.trim();
      const cleanAliases = aliases.map((a: string) => a.trim()).filter(Boolean);
      const updated = await model.upsert({
        where: { name: cleanName },
        update: { aliases: cleanAliases },
        create: { name: cleanName, aliases: cleanAliases }
      });
      return NextResponse.json({ success: true, data: updated });
    } else if (action === 'update_order' && type === 'base') {
      const { colorOrder, sizeOrder } = await request.json();
      const cleanName = name.trim();
      const updated = await prisma.baseProduct.upsert({
        where: { name: cleanName },
        update: { 
          colorOrder: colorOrder || [],
          sizeOrder: sizeOrder || []
        },
        create: {
          name: cleanName,
          aliases: [],
          colorOrder: colorOrder || [],
          sizeOrder: sizeOrder || []
        }
      });
      return NextResponse.json({ success: true, data: updated });
    } else {
      // Auto-register (find or create)
      const existing = await model.findUnique({ where: { name: name.trim() } });
      if (existing) {
        return NextResponse.json({ success: true, data: existing });
      }
      const created = await model.create({
        data: { name: name.trim(), aliases: [] }
      });
      return NextResponse.json({ success: true, data: created });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
