import { prisma } from "@/lib/prisma";
import { getDictionaries, parseProductName } from "@/lib/productParser";
import { isExchangeOrResendInvoice } from "@/lib/weblog/utils";
import { analyzeExchangeOrder } from "@/lib/weblog/exchange-utils";

export interface ItemStatRow {
  baseProduct: string;
  color: string;
  size: string;
  displayName: string;
  soldUnits: number;
  returnedUnits: number;
  netUnits: number;
  unitCost: number;
  totalCost: number;
}

export interface StatsResult {
  dateRange: {
    from: string | null;
    to: string | null;
  };
  totalOrders: number;
  newOrders: number;
  repeatOrders: number;
  repeatRate: number;

  // Outreach conversion
  followedUpOrdersCount: number;
  followedUpRevenue: number;

  // Status breakdown
  deliveredCount: number;
  partialDeliveredCount: number;
  cancelledTotalCount: number;
  cancelledWithChargeCount: number;
  cancelledWithoutChargeCount: number;
  inTransitOrPendingCount: number;

  // Financials
  grossBilled: number;
  totalCod: number;
  totalDeliveryCharge: number;
  netReceivable: number;
  totalCogs: number;
  netMargin: number;

  // Matrix
  productStats: ItemStatRow[];
  totalSoldUnits: number;
  totalReturnedUnits: number;

  // Cancel reasons breakdown
  cancelReasons: Array<{ reason: string; count: number }>;
}

export async function calculateWeblogStats({
  fromDate,
  toDate,
  selectedBaseProduct,
}: {
  fromDate?: Date | null;
  toDate?: Date | null;
  selectedBaseProduct?: string | null;
}): Promise<StatsResult> {
  const where: any = {};

  if (fromDate || toDate) {
    where.date = {};
    if (fromDate) {
      where.date.gte = fromDate;
    }
    if (toDate) {
      where.date.lte = toDate;
    }
  }

  // Fetch orders with customers
  const [orders, costRecords, dictionaries] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { date: "asc" },
      select: {
        id: true,
        invoice_id: true,
        date: true,
        status: true,
        total_bill: true,
        cod_amount: true,
        delivery_charge: true,
        net_receivable: true,
        details: true,
        returned_items: true,
        cancellation_type: true,
        cancel_reason: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            is_followed_up: true,
            total_orders: true,
          },
        },
      },
    }),
    prisma.productCost.findMany({
      orderBy: { effective_from: "asc" },
    }),
    getDictionaries(),
  ]);

  const { flatBases, flatColors, flatSizes } = dictionaries;

  // Helper to get effective unit cost for a product at a specific date
  function getEffectiveUnitCost(baseProduct: string, orderDate: Date | string | null | undefined): number {
    const matching = costRecords.filter(
      (c) => c.base_product_name.toLowerCase() === baseProduct.toLowerCase()
    );

    if (matching.length === 0) return 0;

    const time = orderDate ? new Date(orderDate).getTime() : Date.now();
    const safeTime = isNaN(time) ? Date.now() : time;

    // 1. Check window matches
    for (const c of matching) {
      const from = c.effective_from ? new Date(c.effective_from).getTime() : -Infinity;
      const to = c.effective_to ? new Date(c.effective_to).getTime() : Infinity;
      if (safeTime >= from && safeTime <= to) {
        return c.cost;
      }
    }

    // 2. Fallback to latest cost rule
    return matching[matching.length - 1].cost;
  }

  // Aggregate stats
  let totalOrders = orders.length;
  let newOrders = 0;
  let repeatOrders = 0;
  let followedUpOrdersCount = 0;
  let followedUpRevenue = 0;

  let deliveredCount = 0;
  let partialDeliveredCount = 0;
  let cancelledTotalCount = 0;
  let cancelledWithChargeCount = 0;
  let cancelledWithoutChargeCount = 0;
  let inTransitOrPendingCount = 0;

  let grossBilled = 0;
  let totalCod = 0;
  let totalDeliveryCharge = 0;
  let netReceivable = 0;
  let totalCogs = 0;

  const cancelReasonCounts: Record<string, number> = {};
  const matrixMap: Record<
    string,
    {
      baseProduct: string;
      color: string;
      size: string;
      displayName: string;
      soldUnits: number;
      returnedUnits: number;
      totalCost: number;
      sampleCost: number;
    }
  > = {};

  for (const order of orders) {
    grossBilled += order.total_bill || 0;
    totalCod += order.cod_amount || 0;
    const deliveryCharge = order.delivery_charge || 0;
    totalDeliveryCharge += deliveryCharge;

    const netRec =
      order.net_receivable !== null && order.net_receivable !== undefined
        ? order.net_receivable
        : Math.max(0, (order.cod_amount || order.total_bill || 0) - deliveryCharge);
    netReceivable += netRec;

    // Repeat vs New order
    const isRepeat = (order.customer?.total_orders || 1) > 1;
    if (isRepeat) {
      repeatOrders++;
    } else {
      newOrders++;
    }

    // Followed up customer conversion
    if (order.customer?.is_followed_up) {
      followedUpOrdersCount++;
      followedUpRevenue += netRec;
    }

    // Order status tracking
    const st = order.status;
    if (st === "delivered") {
      deliveredCount++;
    } else if (st === "partial_delivered") {
      partialDeliveredCount++;
    } else if (st === "cancelled") {
      cancelledTotalCount++;
      if (order.cancellation_type === "with_delivery_charge") {
        cancelledWithChargeCount++;
      } else {
        cancelledWithoutChargeCount++;
      }

      if (order.cancel_reason) {
        const cleanReason = order.cancel_reason.trim();
        cancelReasonCounts[cleanReason] = (cancelReasonCounts[cleanReason] || 0) + 1;
      }
    } else {
      inTransitOrPendingCount++;
    }

    // Parse order items for product statistics
    const isExchange = isExchangeOrResendInvoice(order.invoice_id);
    const exchangeAnalysis = isExchange
      ? analyzeExchangeOrder(order.invoice_id, order.details || "")
      : null;

    // Check returned items from manual review
    const returnedItemsList: string[] = [];
    if (Array.isArray(order.returned_items)) {
      for (const item of order.returned_items) {
        if (typeof item === "string") returnedItemsList.push(item.toLowerCase());
        else if (item && typeof item === "object") {
          returnedItemsList.push(
            (item.name || item.product || item.text || "").toString().toLowerCase()
          );
        }
      }
    }

    // Parse items from details
    const rawDetails = order.details || "";
    let itemsStr = rawDetails;
    const noteMatch = rawDetails.match(/^(\[[^\]]+\])\s*(.*)$/);
    if (noteMatch) {
      itemsStr = noteMatch[2];
    }

    const itemChunks = itemsStr
      ? itemsStr
          .split(/,\s*(?=[^,]+?\s*(?:\(x\d+\)|$))/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // If order was full exchange with 0 new sales (pants sent == pants returned), skip sales counting
    if (exchangeAnalysis?.isFullExchange) {
      continue;
    }

    for (const chunk of itemChunks) {
      // Extract qty e.g. "Snuggly Palazzo - Black, XXL (x2)"
      let itemName = chunk;
      let qty = 1;
      const qtyMatch = chunk.match(/^(.*?)\s*\(x(\d+)\)$/);
      if (qtyMatch) {
        itemName = qtyMatch[1].trim();
        qty = parseInt(qtyMatch[2], 10) || 1;
      }

      // Check with POS dictionary alias engine
      const parsed = parseProductName(itemName, flatBases, flatColors, flatSizes);

      const base = parsed.base || itemName.split("-")[0]?.trim() || "Uncategorized";
      const color = parsed.color || "Standard";
      const size = parsed.size || "Free";
      const key = `${base}___${color}___${size}`.toLowerCase();
      const displayName = `${base} - ${color} / ${size}`;

      if (
        selectedBaseProduct &&
        base.toLowerCase() !== selectedBaseProduct.toLowerCase()
      ) {
        continue;
      }

      const unitCost = getEffectiveUnitCost(base, order.date);

      if (!matrixMap[key]) {
        matrixMap[key] = {
          baseProduct: base,
          color,
          size,
          displayName,
          soldUnits: 0,
          returnedUnits: 0,
          totalCost: 0,
          sampleCost: unitCost,
        };
      }

      const isOrderCancelled = st === "cancelled";
      const isItemMarkedReturned = returnedItemsList.some(
        (ret) => ret && (chunk.toLowerCase().includes(ret) || ret.includes(chunk.toLowerCase()))
      );

      if (isOrderCancelled || isItemMarkedReturned) {
        matrixMap[key].returnedUnits += qty;
      } else {
        matrixMap[key].soldUnits += qty;
        const itemCogs = qty * unitCost;
        matrixMap[key].totalCost += itemCogs;
        totalCogs += itemCogs;
      }
    }
  }

  // Convert matrix map to sorted list
  const productStats: ItemStatRow[] = Object.values(matrixMap).map((m) => ({
    baseProduct: m.baseProduct,
    color: m.color,
    size: m.size,
    displayName: m.displayName,
    soldUnits: m.soldUnits,
    returnedUnits: m.returnedUnits,
    netUnits: m.soldUnits,
    unitCost: m.sampleCost,
    totalCost: m.totalCost,
  }));

  // Sort by soldUnits desc
  productStats.sort((a, b) => b.soldUnits - a.soldUnits);

  const totalSoldUnits = productStats.reduce((sum, p) => sum + p.soldUnits, 0);
  const totalReturnedUnits = productStats.reduce((sum, p) => sum + p.returnedUnits, 0);

  // Cancellation reasons
  const cancelReasons = Object.entries(cancelReasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const netMargin = netReceivable - totalCogs;
  const repeatRate = totalOrders > 0 ? Math.round((repeatOrders / totalOrders) * 100) : 0;

  return {
    dateRange: {
      from: fromDate ? fromDate.toISOString() : null,
      to: toDate ? toDate.toISOString() : null,
    },
    totalOrders,
    newOrders,
    repeatOrders,
    repeatRate,
    followedUpOrdersCount,
    followedUpRevenue,
    deliveredCount,
    partialDeliveredCount,
    cancelledTotalCount,
    cancelledWithChargeCount,
    cancelledWithoutChargeCount,
    inTransitOrPendingCount,
    grossBilled,
    totalCod,
    totalDeliveryCharge,
    netReceivable,
    totalCogs,
    netMargin,
    productStats,
    totalSoldUnits,
    totalReturnedUnits,
    cancelReasons,
  };
}
