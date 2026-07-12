import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import ExcelJS from 'exceljs';

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'POS System';
    workbook.lastModifiedBy = 'POS System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // 1. Fetch data
    const locations = await prisma.location.findMany();
    const products = await prisma.product.findMany();
    const inventory = await prisma.inventory.findMany({
      include: {
        product: true,
        location: true
      }
    });

    // 2. Overview Sheet
    const overviewSheet = workbook.addWorksheet('Inventory Overview');
    overviewSheet.columns = [
      { header: 'Product Name', key: 'name', width: 40 },
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Total Quantity', key: 'totalQty', width: 15 }
    ];

    const overviewMap: Record<string, any> = {};
    for (const p of products) {
      overviewMap[p.id] = { name: p.name, sku: p.sku || '', type: p.type, totalQty: 0 };
    }
    for (const inv of inventory) {
      if (overviewMap[inv.productId]) {
        overviewMap[inv.productId].totalQty += inv.quantity;
      }
    }
    for (const row of Object.values(overviewMap)) {
      overviewSheet.addRow(row);
    }
    overviewSheet.getRow(1).font = { bold: true };

    // 3. Details Sheet
    const detailSheet = workbook.addWorksheet('Location Details');
    detailSheet.columns = [
      { header: 'Location Name', key: 'locName', width: 25 },
      { header: 'Location UID', key: 'locUid', width: 15 },
      { header: 'Product Name', key: 'prodName', width: 40 },
      { header: 'Quantity', key: 'qty', width: 15 }
    ];

    for (const inv of inventory) {
      detailSheet.addRow({
        locName: inv.location.name,
        locUid: inv.location.uid,
        prodName: inv.product.name,
        qty: inv.quantity
      });
    }
    detailSheet.getRow(1).font = { bold: true };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="inventory_export_${new Date().getTime()}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}