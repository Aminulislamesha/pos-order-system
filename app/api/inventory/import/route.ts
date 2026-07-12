import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import ExcelJS from 'exceljs';

function generateUID(seq: number): string {
  return `LOC-${seq.toString().padStart(4, '0')}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = formData.get('mode') as string;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ success: false, error: 'Empty workbook' }, { status: 400 });
    }

    // Identify columns
    const headerRow = sheet.getRow(1);
    let nameCol = -1, locCol = -1, qtyCol = -1;
    
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      if (val === 'name' || val === 'product name') nameCol = colNumber;
      if (val === 'location' || val === 'location name') locCol = colNumber;
      if (val === 'quantity' || val === 'qty') qtyCol = colNumber;
    });

    if (nameCol === -1 || locCol === -1 || qtyCol === -1) {
      return NextResponse.json({ success: false, error: 'Missing required columns. Ensure Name, Location, and Quantity are present.' }, { status: 400 });
    }

    // Read data
    const rows: { name: string, loc: string, qty: number }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const name = String(row.getCell(nameCol).value || '').trim();
      const loc = String(row.getCell(locCol).value || '').trim();
      let qty = parseInt(String(row.getCell(qtyCol).value || '0'), 10);
      
      if (isNaN(qty)) qty = 0;
      if (name && loc) {
        rows.push({ name, loc, qty });
      }
    });

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid data rows found in the file.' }, { status: 400 });
    }

    // OVERWRITE Mode: Delete all products (cascades to inventory and logs)
    if (mode === 'OVERWRITE') {
      await prisma.product.deleteMany({});
      // Locations are kept so we don't break existing QR codes.
      // But we will delete any orphaned inventory logs just in case (though cascade should handle it).
      await prisma.inventory.deleteMany({});
      await prisma.inventoryLog.deleteMany({});
    }

    // 1. Process Locations
    // Find missing locations and create them
    const uniqueLocNames = Array.from(new Set(rows.map(r => r.loc)));
    const existingLocations = await prisma.location.findMany();
    const locMap = new Map<string, string>(); // name (lowercase) -> id
    
    for (const l of existingLocations) {
      locMap.set(l.name.toLowerCase(), l.id);
    }

    let nextLocSeq = existingLocations.length + 1;
    for (const l of existingLocations) {
      if (l.uid && l.uid.startsWith('LOC-')) {
        const num = parseInt(l.uid.replace('LOC-', ''), 10);
        if (!isNaN(num) && num >= nextLocSeq) nextLocSeq = num + 1;
      }
    }

    for (const locName of uniqueLocNames) {
      if (!locMap.has(locName.toLowerCase())) {
        const newLoc = await prisma.location.create({
          data: {
            name: locName,
            uid: generateUID(nextLocSeq++)
          }
        });
        locMap.set(locName.toLowerCase(), newLoc.id);
      }
    }

    // 2. Process Products
    const uniqueProductNames = Array.from(new Set(rows.map(r => r.name)));
    const existingProducts = await prisma.product.findMany();
    const prodMap = new Map<string, string>(); // name (lowercase) -> id

    for (const p of existingProducts) {
      prodMap.set(p.name.toLowerCase(), p.id);
    }

    for (const prodName of uniqueProductNames) {
      if (!prodMap.has(prodName.toLowerCase())) {
        const newProd = await prisma.product.create({
          data: {
            name: prodName,
            type: 'PRODUCT'
          }
        });
        prodMap.set(prodName.toLowerCase(), newProd.id);
      }
    }

    // 3. Update Inventory
    for (const row of rows) {
      const productId = prodMap.get(row.name.toLowerCase());
      const locationId = locMap.get(row.loc.toLowerCase());
      
      if (!productId || !locationId) continue;

      if (mode === 'OVERWRITE') {
        // Just upsert replacing quantity
        await prisma.inventory.upsert({
          where: {
            locationId_productId: { locationId, productId }
          },
          update: {
            quantity: row.qty
          },
          create: {
            locationId,
            productId,
            quantity: row.qty
          }
        });
        await prisma.inventoryLog.create({
          data: {
            locationId,
            productId,
            action: 'ADD',
            quantity: row.qty,
            reason: 'Initial Import (Overwrite)'
          }
        });
      } else {
        // MERGE Mode: Add to existing
        if (row.qty > 0) {
          await prisma.inventory.upsert({
            where: {
              locationId_productId: { locationId, productId }
            },
            update: {
              quantity: { increment: row.qty }
            },
            create: {
              locationId,
              productId,
              quantity: row.qty
            }
          });
          await prisma.inventoryLog.create({
            data: {
              locationId,
              productId,
              action: 'ADD',
              quantity: row.qty,
              reason: 'Bulk Import (Merge)'
            }
          });
        }
      }
    }

    return NextResponse.json({ success: true, message: `Processed ${rows.length} rows.` });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
