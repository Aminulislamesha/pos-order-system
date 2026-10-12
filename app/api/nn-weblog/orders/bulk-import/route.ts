import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanPhoneNumber } from "@/lib/weblog/utils";

export interface RawImportRow {
  date?: string;
  invoice_id?: string;
  note?: string;
  name?: string;
  phone?: string;
  addr1?: string;
  addr2?: string;
  total_bill?: number | string;
  delivery_charge?: number | string;
}

import { ensureWeblogTables } from "@/lib/weblog/init-db";

export async function POST(request: NextRequest) {
  try {
    await ensureWeblogTables();
    const body = await request.json();
    const rows: RawImportRow[] = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    // Maximum batch size safeguard for Vercel 10-15s serverless timeout
    if (rows.length > 500) {
      return NextResponse.json(
        { error: "Batch too large. Max 500 rows per request. Recommended chunk size is 200." },
        { status: 400 }
      );
    }

    // 1. Sanitize & validate incoming rows
    const validRows: Array<{
      date: Date;
      invoice_id: string;
      note: string;
      name: string;
      phone: string;
      address: string;
      total_bill: number;
      delivery_charge: number;
    }> = [];

    const seenInvoicesInBatch = new Set<string>();

    for (const r of rows) {
      const invoice = (r.invoice_id || "").toString().trim();
      const phone = cleanPhoneNumber((r.phone || "").toString());
      const name = (r.name || "").toString().trim() || "Customer";

      if (!invoice || !phone) {
        continue; // Skip invalid rows without invoice or phone
      }

      // Skip duplicate within the same incoming payload batch
      if (seenInvoicesInBatch.has(invoice)) {
        continue;
      }
      seenInvoicesInBatch.add(invoice);

      let parsedDate = new Date(r.date || Date.now());
      if (isNaN(parsedDate.getTime())) {
        parsedDate = new Date();
      }

      const addrParts = [
        (r.addr1 || "").toString().trim(),
        (r.addr2 || "").toString().trim(),
      ].filter(Boolean);
      const combinedAddress = addrParts.join(", ") || "No address provided";

      const totalBill = typeof r.total_bill === "number" ? r.total_bill : parseFloat(r.total_bill || "0") || 0;
      const deliveryCharge = typeof r.delivery_charge === "number" ? r.delivery_charge : parseFloat(r.delivery_charge || "0") || 0;

      validRows.push({
        date: parsedDate,
        invoice_id: invoice,
        note: (r.note || "").toString().trim(),
        name,
        phone,
        address: combinedAddress,
        total_bill: totalBill,
        delivery_charge: deliveryCharge,
      });
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        success: true,
        processed: rows.length,
        inserted: 0,
        skippedDuplicates: rows.length,
        message: "No new or valid rows to import.",
      });
    }

    // 2. Prevent duplicate invoice_id insertion:
    const incomingInvoices = validRows.map((r) => r.invoice_id);
    const existingOrders = await prisma.order.findMany({
      where: { invoice_id: { in: incomingInvoices } },
      select: { invoice_id: true },
    });
    const existingInvoiceSet = new Set(existingOrders.map((o) => o.invoice_id));

    const rowsToProcess = validRows.filter((r) => !existingInvoiceSet.has(r.invoice_id));
    const duplicateInvoiceCount = validRows.length - rowsToProcess.length + (rows.length - validRows.length);

    if (rowsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        processed: rows.length,
        inserted: 0,
        skippedDuplicates: duplicateInvoiceCount,
        message: "All invoice IDs in this chunk already exist in the database.",
      });
    }

    // 3. Deduplicate customers based on Phone Number
    const uniquePhones = Array.from(new Set(rowsToProcess.map((r) => r.phone)));

    const existingCustomers = await prisma.customer.findMany({
      where: { phone: { in: uniquePhones } },
    });

    const customerMap = new Map<string, { id: string; name: string; total_orders: number; last_order_date: Date | null }>();
    for (const c of existingCustomers) {
      customerMap.set(c.phone, c);
    }

    // Collect new customers to create
    const newCustomersToCreate: Array<{ name: string; phone: string }> = [];
    const createdPhoneSet = new Set<string>();

    for (const r of rowsToProcess) {
      if (!customerMap.has(r.phone) && !createdPhoneSet.has(r.phone)) {
        newCustomersToCreate.push({
          name: r.name,
          phone: r.phone,
        });
        createdPhoneSet.add(r.phone);
      }
    }

    // Insert new customers
    if (newCustomersToCreate.length > 0) {
      await prisma.customer.createMany({
        data: newCustomersToCreate,
        skipDuplicates: true,
      });

      // Refetch newly created customers to obtain their UUIDs
      const newlyCreated = await prisma.customer.findMany({
        where: { phone: { in: Array.from(createdPhoneSet) } },
      });
      for (const nc of newlyCreated) {
        customerMap.set(nc.phone, nc);
      }
    }

    // 4. Prepare orders and customer update aggregations
    const ordersData: Array<{
      invoice_id: string;
      customer_id: string;
      date: Date;
      address: string;
      details: string;
      total_bill: number;
      delivery_charge: number;
      status: string;
    }> = [];

    const customerOrderCounts = new Map<string, { count: number; maxDate: Date }>();

    for (const r of rowsToProcess) {
      const customer = customerMap.get(r.phone);
      if (!customer) continue;

      ordersData.push({
        invoice_id: r.invoice_id,
        customer_id: customer.id,
        date: r.date,
        address: r.address,
        details: r.note,
        total_bill: r.total_bill,
        delivery_charge: r.delivery_charge,
        status: "pending",
      });

      // Track order additions per customer
      const existingAgg = customerOrderCounts.get(customer.id);
      if (!existingAgg) {
        customerOrderCounts.set(customer.id, { count: 1, maxDate: r.date });
      } else {
        existingAgg.count += 1;
        if (r.date > existingAgg.maxDate) {
          existingAgg.maxDate = r.date;
        }
      }
    }

    // 5. Bulk insert orders
    await prisma.order.createMany({
      data: ordersData,
      skipDuplicates: true,
    });

    // 6. Update customer total_orders and last_order_date
    const updatePromises = Array.from(customerOrderCounts.entries()).map(([customerId, agg]) => {
      return prisma.customer.update({
        where: { id: customerId },
        data: {
          total_orders: { increment: agg.count },
          last_order_date: agg.maxDate,
          is_followed_up: false, // Reset follow up flag when a new order is placed
        },
      });
    });

    await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      processed: rows.length,
      inserted: ordersData.length,
      skippedDuplicates: duplicateInvoiceCount,
      newCustomersCreated: newCustomersToCreate.length,
      existingCustomersLinked: rowsToProcess.length - newCustomersToCreate.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Bulk import failed";
    console.error("Bulk import error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
