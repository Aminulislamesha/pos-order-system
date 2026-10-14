import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureWeblogTables } from "@/lib/weblog/init-db";
import ExcelJS from "exceljs";
import {
  StatementRowInput,
  matchAllPendingStatements,
  reconcileSingleOrderWithStatement,
} from "@/lib/weblog/reconcile-statements";
import { getBaseInvoiceId } from "@/lib/weblog/utils";

export async function POST(request: NextRequest) {
  try {
    await ensureWeblogTables();

    const contentType = request.headers.get("content-type") || "";
    let rawRows: StatementRowInput[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          return NextResponse.json({ error: "Worksheet is empty" }, { status: 400 });
        }

        const headerRow = worksheet.getRow(1);
        const colMap = new Map<string, number>();
        headerRow.eachCell((cell, colNumber) => {
          const val = String(cell.value || "").trim().toLowerCase();
          colMap.set(val, colNumber);
        });

        const getColVal = (row: ExcelJS.Row, ...names: string[]) => {
          for (const name of names) {
            const idx = colMap.get(name.toLowerCase());
            if (idx) {
              const val = row.getCell(idx).value;
              if (val !== null && val !== undefined) {
                // If it's a formula or object
                if (typeof val === "object" && "result" in val) {
                  return String((val as any).result || "");
                }
                return String(val);
              }
            }
          }
          return "";
        };

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header

          const orderId = getColVal(row, "order id", "consignment id", "consignment_id", "order_id");
          const invoice = getColVal(row, "invoice", "invoice id", "invoice_id");

          if (!orderId && !invoice) return; // skip empty

          const trackingCode = getColVal(row, "tracking code", "tracking_code");
          const recipientName = getColVal(row, "recipient name", "customer name", "name");
          const recipientPhone = getColVal(row, "recipient phone", "phone");
          const recipientAddress = getColVal(row, "recipient address", "address");
          const deliveryStatus = getColVal(row, "delivery status", "status");
          const approvalStatus = getColVal(row, "approval status");
          const deliveryTime = getColVal(row, "delivery time", "delivery_time", "delivered at");
          const riderName = getColVal(row, "rider", "rider name");
          const riderPhone = getColVal(row, "riders phone", "rider phone");
          const codStr = getColVal(row, "cod amount", "cod", "cod_amount");
          const shippingStr = getColVal(row, "shipping charge", "delivery charge", "shipping_charge");
          const codChargeStr = getColVal(row, "cod charge", "cod_charge");
          const paymentStatus = getColVal(row, "payment status", "payment_status");
          const note = getColVal(row, "note");
          const createdAtCourier = getColVal(row, "created at", "created_at");
          const approvedAt = getColVal(row, "approved at", "approved_at");

          rawRows.push({
            order_id: orderId || invoice,
            tracking_code: trackingCode || undefined,
            invoice: invoice || orderId,
            recipient_name: recipientName || undefined,
            recipient_phone: recipientPhone ? recipientPhone.replace(/[`']/g, "").trim() : undefined,
            recipient_address: recipientAddress || undefined,
            delivery_status: deliveryStatus || undefined,
            approval_status: approvalStatus || undefined,
            delivery_time: deliveryTime || undefined,
            rider_name: riderName || undefined,
            rider_phone: riderPhone || undefined,
            cod_amount: parseFloat(codStr || "0") || 0,
            shipping_charge: parseFloat(shippingStr || "0") || 0,
            cod_charge: parseFloat(codChargeStr || "0") || 0,
            payment_status: paymentStatus || undefined,
            note: note || undefined,
            created_at_courier: createdAtCourier || undefined,
            approved_at: approvedAt || undefined,
          });
        });
      } else {
        // Plain CSV text parsing
        const text = buffer.toString("utf-8");
        rawRows = parseCSVToStatementRows(text);
      }
    } else {
      // JSON body or raw CSV
      const body = await request.json();
      if (Array.isArray(body.rows)) {
        rawRows = body.rows;
      } else if (typeof body.csvText === "string") {
        rawRows = parseCSVToStatementRows(body.csvText);
      } else {
        return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
      }
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No valid statement rows found in file" }, { status: 400 });
    }

    // 1. Bulk Upsert into SteadfastStatement
    let insertedOrUpdated = 0;

    for (const r of rawRows) {
      const orderId = (r.order_id || "").toString().trim();
      const invoice = (r.invoice || "").toString().trim();
      if (!orderId && !invoice) continue;

      const cleanOrderId = orderId || invoice;
      const cleanPhone = (r.recipient_phone || "").toString().replace(/[`']/g, "").trim();

      await prisma.steadfastStatement.upsert({
        where: { order_id: cleanOrderId },
        update: {
          tracking_code: r.tracking_code || undefined,
          invoice,
          recipient_name: r.recipient_name || undefined,
          recipient_phone: cleanPhone || undefined,
          recipient_address: r.recipient_address || undefined,
          delivery_status: r.delivery_status || undefined,
          approval_status: r.approval_status || undefined,
          delivery_time: r.delivery_time || undefined,
          rider_name: r.rider_name || undefined,
          rider_phone: r.rider_phone || undefined,
          cod_amount: r.cod_amount || 0,
          shipping_charge: r.shipping_charge || 0,
          cod_charge: r.cod_charge || 0,
          payment_status: r.payment_status || undefined,
          note: r.note || undefined,
          created_at_courier: r.created_at_courier || undefined,
          approved_at: r.approved_at || undefined,
        },
        create: {
          order_id: cleanOrderId,
          tracking_code: r.tracking_code || undefined,
          invoice,
          recipient_name: r.recipient_name || undefined,
          recipient_phone: cleanPhone || undefined,
          recipient_address: r.recipient_address || undefined,
          delivery_status: r.delivery_status || undefined,
          approval_status: r.approval_status || undefined,
          delivery_time: r.delivery_time || undefined,
          rider_name: r.rider_name || undefined,
          rider_phone: r.rider_phone || undefined,
          cod_amount: r.cod_amount || 0,
          shipping_charge: r.shipping_charge || 0,
          cod_charge: r.cod_charge || 0,
          payment_status: r.payment_status || undefined,
          note: r.note || undefined,
          created_at_courier: r.created_at_courier || undefined,
          approved_at: r.approved_at || undefined,
        },
      });
      insertedOrUpdated++;
    }

    // 2. Trigger Reconciliation immediately against Order table
    const { reconciledCount, remainingPending } = await matchAllPendingStatements();

    // 3. Log to ActivityLog
    await prisma.activityLog.create({
      data: {
        action: "STATEMENT_UPLOAD",
        title: "Steadfast Payment Statement Uploaded",
        details: `Uploaded ${insertedOrUpdated} statement rows. Matched & reconciled ${reconciledCount} orders immediately. ${remainingPending} statement rows saved for future order matching.`,
        metadata: {
          totalRows: rawRows.length,
          savedRows: insertedOrUpdated,
          reconciledOrders: reconciledCount,
          pendingForFuture: remainingPending,
        },
      },
    });

    return NextResponse.json({
      success: true,
      totalRows: rawRows.length,
      savedRows: insertedOrUpdated,
      reconciledOrders: reconciledCount,
      pendingForFuture: remainingPending,
      message: `Successfully processed ${insertedOrUpdated} statement rows! Reconciled ${reconciledCount} orders.`,
    });
  } catch (err: unknown) {
    console.error("Statement upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process statement file" },
      { status: 500 }
    );
  }
}

function parseCSVToStatementRows(text: string): StatementRowInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const colMap = new Map<string, number>();
  header.forEach((h, i) => colMap.set(h, i));

  const getVal = (cols: string[], ...names: string[]) => {
    for (const name of names) {
      const idx = colMap.get(name.toLowerCase());
      if (idx !== undefined && cols[idx] !== undefined) {
        return cols[idx].trim();
      }
    }
    return "";
  };

  const results: StatementRowInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const orderId = getVal(cols, "order id", "consignment id", "order_id", "consignment_id");
    const invoice = getVal(cols, "invoice", "invoice id", "invoice_id");

    if (!orderId && !invoice) continue;

    results.push({
      order_id: orderId || invoice,
      tracking_code: getVal(cols, "tracking code", "tracking_code"),
      invoice: invoice || orderId,
      recipient_name: getVal(cols, "recipient name", "customer name", "name"),
      recipient_phone: getVal(cols, "recipient phone", "phone").replace(/[`']/g, "").trim(),
      recipient_address: getVal(cols, "recipient address", "address"),
      delivery_status: getVal(cols, "delivery status", "status"),
      approval_status: getVal(cols, "approval status"),
      delivery_time: getVal(cols, "delivery time", "delivery_time", "delivered at"),
      rider_name: getVal(cols, "rider", "rider name"),
      rider_phone: getVal(cols, "riders phone", "rider phone"),
      cod_amount: parseFloat(getVal(cols, "cod amount", "cod", "cod_amount") || "0") || 0,
      shipping_charge: parseFloat(getVal(cols, "shipping charge", "delivery charge", "shipping_charge") || "0") || 0,
      cod_charge: parseFloat(getVal(cols, "cod charge", "cod_charge") || "0") || 0,
      payment_status: getVal(cols, "payment status", "payment_status"),
      note: getVal(cols, "note"),
      created_at_courier: getVal(cols, "created at", "created_at"),
      approved_at: getVal(cols, "approved at", "approved_at"),
    });
  }

  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === "\t") && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += char;
    }
  }
  result.push(cur);
  return result;
}
