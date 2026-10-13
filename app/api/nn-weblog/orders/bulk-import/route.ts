import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  cleanPhoneNumber,
  parseDateToYMD,
  getBaseInvoiceId,
  isExchangeOrResendInvoice,
} from "@/lib/weblog/utils";
import { analyzeExchangeOrder } from "@/lib/weblog/exchange-utils";

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
  items?: Array<{ product: string; quantity: string | number }>;
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

    // 1. Sanitize & validate incoming rows (no skipping of duplicate invoices)
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

    let exchangeOrdersCount = 0;

    for (const r of rows) {
      const invoice = (r.invoice_id || "").toString().trim();
      const phone = cleanPhoneNumber((r.phone || "").toString());
      const name = (r.name || "").toString().trim() || "Customer";

      if (!invoice || !phone) {
        continue; // Skip blank rows without invoice or phone
      }

      if (isExchangeOrResendInvoice(invoice)) {
        exchangeOrdersCount++;
      }

      const ymd = parseDateToYMD(r.date);
      let parsedDate = new Date(`${ymd}T00:00:00.000Z`);
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

      // Compile details from note and items
      const noteStr = (r.note || "").toString().trim();
      const validItems = Array.isArray(r.items)
        ? r.items.filter(
            (it) =>
              (it.product || "").trim() ||
              (it.quantity || "").toString().trim()
          )
        : [];

      let details = "";
      if (validItems.length > 0) {
        const itemsText = validItems
          .map((it) => {
            const prod = (it.product || "").trim();
            const qty = (it.quantity || "").toString().trim();
            return qty ? `${prod} (x${qty})` : prod;
          })
          .join(", ");

        if (noteStr) {
          details = `[${noteStr}] ${itemsText}`;
        } else {
          details = itemsText;
        }
      } else {
        details = noteStr;
      }

      validRows.push({
        date: parsedDate,
        invoice_id: invoice,
        note: details,
        rawNote: noteStr,
        rawItems: validItems,
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
        exchangeOrders: 0,
        newCustomersCreated: 0,
        existingCustomersLinked: 0,
        message: "No valid rows to import.",
      });
    }

    const rowsToProcess = validRows;

    // 2. Deduplicate customers based on Phone Number
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

    // 3. Base Invoice Tracking & Existing Orders for Smart Merging:
    const allCustomerIds = Array.from(customerMap.values()).map((c) => c.id);
    const incomingInvoices = rowsToProcess.map((r) => r.invoice_id);

    const [existingCustomerOrders, existingInvoicesInDb] = await Promise.all([
      prisma.order.findMany({
        where: { customer_id: { in: allCustomerIds } },
        select: { customer_id: true, invoice_id: true },
      }),
      prisma.order.findMany({
        where: { invoice_id: { in: incomingInvoices } },
      }),
    ]);

    const existingOrderMap = new Map(existingInvoicesInDb.map((o) => [o.invoice_id, o]));

    const customerKnownBases = new Map<string, Set<string>>();
    for (const o of existingCustomerOrders) {
      if (!customerKnownBases.has(o.customer_id)) {
        customerKnownBases.set(o.customer_id, new Set());
      }
      const base = getBaseInvoiceId(o.invoice_id);
      if (base) {
        customerKnownBases.get(o.customer_id)!.add(base);
      }
    }

    // Customer contact points accumulator
    const customerAddressesMap = new Map<string, Set<string>>();
    const customerPhonesMap = new Map<string, Set<string>>();
    for (const c of customerMap.values() as any) {
      customerAddressesMap.set(c.id, new Set(c.addresses || []));
      customerPhonesMap.set(c.id, new Set(c.alternate_phones || []));
    }

    // 4. Prepare orders and customer update aggregations
    const ordersDataToInsert: Array<any> = [];
    const mergePromises: Array<Promise<any>> = [];
    let mergedOrdersCount = 0;

    const customerOrderCounts = new Map<string, { count: number; maxDate: Date }>();

    for (const r of rowsToProcess) {
      const customer = customerMap.get(r.phone);
      if (!customer) continue;

      // Accumulate unique address and alternate phone
      if (r.address && r.address !== "No address provided") {
        customerAddressesMap.get(customer.id)?.add(r.address);
      }
      if (r.phone) {
        customerPhonesMap.get(customer.id)?.add(r.phone);
      }

      // Exchange analysis: check if pant count mismatch requires review
      const exchangeAnalysis = analyzeExchangeOrder(r.invoice_id, r.rawNote || r.note, r.rawItems);
      const requiresReview = exchangeAnalysis.requiresReview;
      const reviewStatus = exchangeAnalysis.requiresReview ? "EXCHANGE_MISMATCH" : null;

      // Smart merge check
      const existingOrder = existingOrderMap.get(r.invoice_id);
      if (existingOrder) {
        mergedOrdersCount++;
        mergePromises.push(
          prisma.order.update({
            where: { id: existingOrder.id },
            data: {
              total_bill: r.total_bill,
              details: r.note,
              address: r.address,
              ...(requiresReview ? { requires_manual_review: true, manual_review_status: reviewStatus } : {}),
            },
          })
        );
        continue;
      }

      ordersDataToInsert.push({
        invoice_id: r.invoice_id,
        customer_id: customer.id,
        date: r.date,
        address: r.address,
        details: r.note,
        total_bill: r.total_bill,
        delivery_charge: r.delivery_charge,
        cod_amount: 0.0,
        net_receivable: -r.delivery_charge,
        status: "pending",
        requires_manual_review: requiresReview,
        manual_review_status: reviewStatus,
      });

      const baseInv = getBaseInvoiceId(r.invoice_id);
      const isExchange = isExchangeOrResendInvoice(r.invoice_id);

      if (!customerKnownBases.has(customer.id)) {
        customerKnownBases.set(customer.id, new Set());
      }
      const knownBases = customerKnownBases.get(customer.id)!;

      // Only count as a new base order if it is NOT an exchange AND its base invoice was not already counted
      let isNewBaseOrder = false;
      if (!isExchange && baseInv && !knownBases.has(baseInv)) {
        isNewBaseOrder = true;
        knownBases.add(baseInv);
      }

      const existingAgg = customerOrderCounts.get(customer.id);
      if (!existingAgg) {
        customerOrderCounts.set(customer.id, {
          count: isNewBaseOrder ? 1 : 0,
          maxDate: r.date,
        });
      } else {
        if (isNewBaseOrder) {
          existingAgg.count += 1;
        }
        if (r.date > existingAgg.maxDate) {
          existingAgg.maxDate = r.date;
        }
      }
    }

    // 5. Execute insertions and merges
    if (ordersDataToInsert.length > 0) {
      await prisma.order.createMany({
        data: ordersDataToInsert,
      });
    }

    if (mergePromises.length > 0) {
      await Promise.all(mergePromises);
    }

    // 6. Update customer total_orders, last_order_date, addresses, and alternate_phones
    const updatePromises = Array.from(customerOrderCounts.entries()).map(([customerId, agg]) => {
      const currentCust = Array.from(customerMap.values()).find((c) => c.id === customerId);
      const currentTotal = currentCust?.total_orders || 0;
      const incrementCount = currentTotal === 0 ? Math.max(1, agg.count) : agg.count;

      const addrs = Array.from(customerAddressesMap.get(customerId) || []);
      const phones = Array.from(customerPhonesMap.get(customerId) || []);

      return prisma.customer.update({
        where: { id: customerId },
        data: {
          total_orders: { increment: incrementCount },
          last_order_date: agg.maxDate,
          is_followed_up: false,
          addresses: addrs,
          alternate_phones: phones,
        },
      });
    });

    await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      processed: rows.length,
      inserted: ordersDataToInsert.length,
      merged: mergedOrdersCount,
      exchangeOrders: exchangeOrdersCount,
      newCustomersCreated: newCustomersToCreate.length,
      existingCustomersLinked: rowsToProcess.length - newCustomersToCreate.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Bulk import failed";
    console.error("Bulk import error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
