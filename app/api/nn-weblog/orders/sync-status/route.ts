import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchSteadfastStatusByInvoice } from "@/lib/weblog/steadfast";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

interface SyncRequestPayload {
  orderIds?: string[];
  limit?: number;
  onlyPending?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    await ensureWeblogTables();

    let body: SyncRequestPayload = {};
    try {
      body = await request.json();
    } catch {
      // Optional body
    }

    return await handleSync(body);
  } catch (err: unknown) {
    console.error("Batch sync status error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sync statuses" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureWeblogTables();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const onlyPending = searchParams.get("onlyPending") !== "false";

    return await handleSync({ limit, onlyPending });
  } catch (err: unknown) {
    console.error("Batch sync status GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sync statuses" },
      { status: 500 }
    );
  }
}

async function handleSync(payload: SyncRequestPayload) {
  const limit = Math.min(Math.max(payload.limit || 20, 1), 50);
  const onlyPending = payload.onlyPending !== false;
  const orderIds =
    Array.isArray(payload.orderIds) && payload.orderIds.length > 0
      ? payload.orderIds
      : null;

  // Build query
  const where: any = {};
  if (orderIds) {
    where.id = { in: orderIds };
  } else if (onlyPending) {
    where.status = "pending";
    // Check orders never checked, or checked more than 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    where.OR = [
      { last_status_checked_at: null },
      { last_status_checked_at: { lt: fiveMinutesAgo } },
    ];
  }

  const ordersToSync = await prisma.order.findMany({
    where,
    take: limit,
    orderBy: [
      { last_status_checked_at: "asc" },
      { date: "desc" },
    ],
    select: {
      id: true,
      invoice_id: true,
      status: true,
      tracking_code: true,
      consignment_id: true,
      cod_amount: true,
      delivery_charge: true,
      cancellation_type: true,
      cancel_reason: true,
      requires_manual_review: true,
      manual_review_status: true,
      steadfast_created_at: true,
      delivery_date: true,
      return_date: true,
      return_status: true,
    },
  });

  const totalPendingInDb = await prisma.order.count({
    where: { status: "pending" },
  });

  if (ordersToSync.length === 0) {
    return NextResponse.json({
      success: true,
      processed: 0,
      updated: 0,
      remainingPending: totalPendingInDb,
      message: "No orders requiring sync at this time.",
      results: [],
    });
  }

  // Parallel requests with concurrency limit (up to 5 concurrent queries to Packzy API)
  const CONCURRENCY = 5;
  const results: Array<{
    id: string;
    invoice: string;
    previousStatus: string;
    newStatus: string;
    updated: boolean;
    trackingCode?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < ordersToSync.length; i += CONCURRENCY) {
    const chunk = ordersToSync.slice(i, i + CONCURRENCY);
    const chunkPromises = chunk.map(async (order) => {
      const now = new Date();
      try {
        const res = await fetchSteadfastStatusByInvoice(order.invoice_id, {
          cod_amount: order.cod_amount,
          delivery_charge: order.delivery_charge,
          consignment_id: order.consignment_id,
        });

        if (res.success && res.status) {
          const newStatus = res.status;
          const statusChanged = order.status !== newStatus;

          const updateData: Record<string, unknown> = {
            status: newStatus,
            tracking_code: res.trackingCode || order.tracking_code,
            consignment_id: res.consignmentId || order.consignment_id,
            cod_amount: res.codAmount ?? order.cod_amount,
            delivery_charge: res.deliveryCharge ?? order.delivery_charge,
            net_receivable: res.netReceivable ?? (order.cod_amount - order.delivery_charge),
            cancellation_type: res.cancellationType || order.cancellation_type,
            cancel_reason: res.cancelReason || order.cancel_reason,
            requires_manual_review: res.requiresManualReview || order.requires_manual_review,
            manual_review_status: res.manualReviewStatus || order.manual_review_status,
            steadfast_created_at: res.steadfastCreatedAt || order.steadfast_created_at,
            delivery_date: res.deliveryDate || order.delivery_date,
            return_date: res.returnDate || order.return_date,
            return_status: res.returnStatus || order.return_status,
            last_status_checked_at: now,
          };

          if (statusChanged) {
            await prisma.$transaction([
              prisma.order.update({
                where: { id: order.id },
                data: updateData,
              }),
              prisma.trackingHistory.create({
                data: {
                  order_id: order.id,
                  previous_status: order.status,
                  new_status: newStatus,
                  message: `Auto-sync: updated status from ${order.status} to ${newStatus}`,
                  timestamp: now,
                },
              }),
            ]);
          } else {
            await prisma.order.update({
              where: { id: order.id },
              data: updateData,
            });
          }

          return {
            id: order.id,
            invoice: order.invoice_id,
            previousStatus: order.status,
            newStatus,
            updated: statusChanged,
            trackingCode: res.trackingCode,
          };
        } else {
          // If not found in Steadfast or courier returned error, touch last_status_checked_at so it doesn't loop
          await prisma.order.update({
            where: { id: order.id },
            data: { last_status_checked_at: now },
          });

          return {
            id: order.id,
            invoice: order.invoice_id,
            previousStatus: order.status,
            newStatus: order.status,
            updated: false,
            error: res.error,
          };
        }
      } catch (err: unknown) {
        return {
          id: order.id,
          invoice: order.invoice_id,
          previousStatus: order.status,
          newStatus: order.status,
          updated: false,
          error: err instanceof Error ? err.message : "Sync error",
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  const updatedCount = results.filter((r) => r.updated).length;
  const newRemainingPending = await prisma.order.count({
    where: { status: "pending" },
  });

  return NextResponse.json({
    success: true,
    processed: results.length,
    updated: updatedCount,
    remainingPending: newRemainingPending,
    results,
  });
}
