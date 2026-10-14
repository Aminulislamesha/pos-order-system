import { prisma } from "@/lib/prisma";
import { normalizeSteadfastStatus } from "@/lib/weblog/steadfast";
import { getBaseInvoiceId } from "@/lib/weblog/utils";

export interface StatementRowInput {
  order_id: string; // Consignment ID
  tracking_code?: string;
  invoice: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  delivery_status?: string;
  approval_status?: string;
  delivery_time?: string;
  rider_name?: string;
  rider_phone?: string;
  cod_amount?: number;
  shipping_charge?: number;
  cod_charge?: number;
  payment_status?: string;
  note?: string;
  created_at_courier?: string;
  approved_at?: string;
}

export function parseSteadfastDateTime(str: string | null | undefined): Date | null {
  if (!str) return null;
  const trimmed = str.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?$/i);
  if (match) {
    const [, y, m, d, hh, mm, ss, meridiem] = match;
    let hour = parseInt(hh, 10);
    if (meridiem) {
      if (meridiem.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (meridiem.toLowerCase() === "am" && hour === 12) hour = 0;
    }
    const iso = `${y}-${m}-${d}T${String(hour).padStart(2, "0")}:${mm}:${ss}.000Z`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) return dt;
  }
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Reconciles an order with a statement row and records tracking history
 */
export async function reconcileSingleOrderWithStatement(
  order: {
    id: string;
    invoice_id: string;
    status: string;
    cod_amount: number;
    delivery_charge: number;
    consignment_id: string | null;
    tracking_code: string | null;
  },
  statement: {
    id?: string;
    order_id: string;
    tracking_code?: string | null;
    invoice: string;
    delivery_status?: string | null;
    delivery_time?: string | null;
    cod_amount: number;
    shipping_charge: number;
  }
) {
  const normStatus = normalizeSteadfastStatus(statement.delivery_status || order.status);
  const cod = typeof statement.cod_amount === "number" ? statement.cod_amount : 0.0;
  const shipping = typeof statement.shipping_charge === "number" ? statement.shipping_charge : 0.0;
  const netRec = cod - shipping;
  const deliveryDt = parseSteadfastDateTime(statement.delivery_time);

  let cancellationType: string | null = null;
  if (normStatus === "cancelled") {
    cancellationType = cod > 0 ? "with_delivery_charge" : "without_delivery_charge";
  }

  const prevStatus = order.status;
  const statusChanged = prevStatus !== normStatus;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: normStatus,
        cod_amount: cod,
        delivery_charge: shipping,
        net_receivable: netRec,
        consignment_id: statement.order_id || order.consignment_id,
        tracking_code: statement.tracking_code || order.tracking_code,
        ...(deliveryDt ? { delivery_date: deliveryDt } : {}),
        ...(cancellationType ? { cancellation_type: cancellationType } : {}),
        last_status_checked_at: new Date(),
      },
    });

    if (statement.id) {
      await tx.steadfastStatement.update({
        where: { id: statement.id },
        data: {
          is_matched: true,
          matched_order_id: order.id,
          matched_at: new Date(),
        },
      });
    }

    await tx.trackingHistory.create({
      data: {
        order_id: order.id,
        previous_status: prevStatus,
        new_status: normStatus,
        message: `Settled via Steadfast Payment Statement. Consignment: ${statement.order_id}, COD: ৳${cod}, Delivery: ৳${shipping}, Net: ৳${netRec}`,
      },
    });
  });
}

/**
 * Reconciles all unmatched statements against the Order table
 */
export async function matchAllPendingStatements(): Promise<{
  reconciledCount: number;
  remainingPending: number;
}> {
  const unmatchedStatements = await prisma.steadfastStatement.findMany({
    where: { is_matched: false },
    take: 500,
  });

  if (unmatchedStatements.length === 0) {
    const remainingPending = await prisma.steadfastStatement.count({ where: { is_matched: false } });
    return { reconciledCount: 0, remainingPending };
  }

  const cids = unmatchedStatements.map((s) => s.order_id).filter(Boolean);
  const invoices = unmatchedStatements.map((s) => s.invoice.trim()).filter(Boolean);
  const baseInvoices = unmatchedStatements
    .map((s) => getBaseInvoiceId(s.invoice))
    .filter((b): b is string => Boolean(b));

  const candidateOrders = await prisma.order.findMany({
    where: {
      OR: [
        { consignment_id: { in: cids } },
        { invoice_id: { in: Array.from(new Set([...invoices, ...baseInvoices])) } },
      ],
    },
    select: {
      id: true,
      invoice_id: true,
      status: true,
      cod_amount: true,
      delivery_charge: true,
      consignment_id: true,
      tracking_code: true,
    },
  });

  // Create lookups
  const orderByCid = new Map<string, typeof candidateOrders[0]>();
  const orderByInvoice = new Map<string, typeof candidateOrders[0]>();
  const orderByBaseInv = new Map<string, typeof candidateOrders[0]>();

  for (const o of candidateOrders) {
    if (o.consignment_id) orderByCid.set(o.consignment_id, o);
    orderByInvoice.set(o.invoice_id.trim().toLowerCase(), o);
    const base = getBaseInvoiceId(o.invoice_id);
    if (base) orderByBaseInv.set(base.trim().toLowerCase(), o);
  }

  let reconciledCount = 0;

  for (const st of unmatchedStatements) {
    const invKey = st.invoice.trim().toLowerCase();
    const baseKey = getBaseInvoiceId(st.invoice)?.trim().toLowerCase();

    // 1. Strict match by Steadfast Consignment ID (Order.consignment_id === Statement.order_id)
    let matchedOrder = orderByCid.get(st.order_id);

    // 2. Safe fallback: If order does not have consignment_id yet, match by exact invoice
    if (!matchedOrder) {
      const candidate = orderByInvoice.get(invKey) || (baseKey ? orderByBaseInv.get(baseKey) : undefined);
      if (candidate && (!candidate.consignment_id || candidate.consignment_id === st.order_id)) {
        matchedOrder = candidate;
      }
    }

    if (matchedOrder) {
      try {
        await reconcileSingleOrderWithStatement(matchedOrder, st);
        reconciledCount++;
      } catch (err) {
        console.error(`Error reconciling order ${matchedOrder.invoice_id} with statement CID ${st.order_id}:`, err);
      }
    }
  }

  const remainingPending = await prisma.steadfastStatement.count({ where: { is_matched: false } });
  return { reconciledCount, remainingPending };
}

/**
 * Called after new orders are imported to check against stored statements
 */
export async function matchNewOrdersAgainstStoredStatements(
  invoices: string[],
  consignmentIds?: string[]
): Promise<number> {
  if (invoices.length === 0 && (!consignmentIds || consignmentIds.length === 0)) {
    return 0;
  }

  const invoiceClean = invoices.map((inv) => inv.trim());
  const baseInvoices = invoiceClean.map((inv) => getBaseInvoiceId(inv)).filter((b): b is string => Boolean(b));
  const allInvCandidates = Array.from(new Set([...invoiceClean, ...baseInvoices]));

  const matchingStatements = await prisma.steadfastStatement.findMany({
    where: {
      OR: [
        { invoice: { in: allInvCandidates } },
        ...(consignmentIds && consignmentIds.length > 0 ? [{ order_id: { in: consignmentIds } }] : []),
      ],
    },
  });

  if (matchingStatements.length === 0) return 0;

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { invoice_id: { in: allInvCandidates } },
        ...(consignmentIds && consignmentIds.length > 0 ? [{ consignment_id: { in: consignmentIds } }] : []),
      ],
    },
    select: {
      id: true,
      invoice_id: true,
      status: true,
      cod_amount: true,
      delivery_charge: true,
      consignment_id: true,
      tracking_code: true,
    },
  });

  const orderByCid = new Map<string, typeof orders[0]>();
  const orderByInvoice = new Map<string, typeof orders[0]>();
  const orderByBaseInv = new Map<string, typeof orders[0]>();

  for (const o of orders) {
    if (o.consignment_id) orderByCid.set(o.consignment_id, o);
    orderByInvoice.set(o.invoice_id.trim().toLowerCase(), o);
    const base = getBaseInvoiceId(o.invoice_id);
    if (base) orderByBaseInv.set(base.trim().toLowerCase(), o);
  }

  let reconciledCount = 0;

  for (const st of matchingStatements) {
    const invKey = st.invoice.trim().toLowerCase();
    const baseKey = getBaseInvoiceId(st.invoice)?.trim().toLowerCase();

    // 1. Strict match by Steadfast Consignment ID (Order.consignment_id === Statement.order_id)
    let matchedOrder = orderByCid.get(st.order_id);

    // 2. Safe fallback: If order does not have consignment_id yet, match by exact invoice
    if (!matchedOrder) {
      const candidate = orderByInvoice.get(invKey) || (baseKey ? orderByBaseInv.get(baseKey) : undefined);
      if (candidate && (!candidate.consignment_id || candidate.consignment_id === st.order_id)) {
        matchedOrder = candidate;
      }
    }

    if (matchedOrder) {
      try {
        await reconcileSingleOrderWithStatement(matchedOrder, st);
        reconciledCount++;
      } catch (err) {
        console.error(`Error matching new order ${matchedOrder.invoice_id} with statement:`, err);
      }
    }
  }

  return reconciledCount;
}
