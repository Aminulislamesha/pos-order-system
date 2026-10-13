import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchSteadfastStatusByInvoice } from "@/lib/weblog/steadfast";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { tracking_history: { orderBy: { timestamp: "desc" } } },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const force = request.nextUrl.searchParams.get("force") === "true";

    // 60-second status cache limit enforcement (unless forced)
    const COOLDOWN_MS = 60 * 1000;
    if (!force && order.last_status_checked_at) {
      const elapsed = Date.now() - new Date(order.last_status_checked_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        const secondsRemaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        return NextResponse.json(
          {
            cached: true,
            secondsRemaining,
            message: `Steadfast cache active. Please wait ${secondsRemaining}s before requesting a live status check.`,
            order,
          },
          { status: 429 }
        );
      }
    }

    // Call Steadfast API
    const result = await fetchSteadfastStatusByInvoice(order.invoice_id, {
      cod_amount: order.cod_amount,
      delivery_charge: order.delivery_charge,
      consignment_id: order.consignment_id,
    });

    if (!result.success || !result.status) {
      return NextResponse.json(
        {
          error: result.error || "Unable to retrieve status from Steadfast Courier API",
          cached: false,
        },
        { status: 502 }
      );
    }

    const newStatus = result.status;
    const previousStatus = order.status;
    const now = new Date();

    const updateData: Record<string, unknown> = {
      status: newStatus,
      tracking_code: result.trackingCode || order.tracking_code,
      consignment_id: result.consignmentId || order.consignment_id,
      cod_amount: result.codAmount ?? order.cod_amount,
      delivery_charge: result.deliveryCharge ?? order.delivery_charge,
      net_receivable: result.netReceivable ?? (order.cod_amount - order.delivery_charge),
      cancellation_type: result.cancellationType || order.cancellation_type,
      cancel_reason: result.cancelReason || order.cancel_reason,
      requires_manual_review: result.requiresManualReview || order.requires_manual_review,
      manual_review_status: result.manualReviewStatus || order.manual_review_status,
      steadfast_created_at: result.steadfastCreatedAt || order.steadfast_created_at,
      delivery_date: result.deliveryDate || order.delivery_date,
      return_date: result.returnDate || order.return_date,
      return_status: result.returnStatus || order.return_status,
      last_status_checked_at: now,
    };

    let updatedOrder;
    if (previousStatus !== newStatus) {
      const [orderResult] = await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: updateData,
          include: {
            customer: true,
            tracking_history: { orderBy: { timestamp: "desc" } },
          },
        }),
        prisma.trackingHistory.create({
          data: {
            order_id: order.id,
            previous_status: previousStatus,
            new_status: newStatus,
            message: `Manual refresh triggered: status updated from ${previousStatus} to ${newStatus}`,
            timestamp: now,
          },
        }),
      ]);
      updatedOrder = orderResult;
    } else {
      updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: updateData,
        include: {
          customer: true,
          tracking_history: { orderBy: { timestamp: "desc" } },
        },
      });
    }

    return NextResponse.json({
      success: true,
      cached: false,
      statusChanged: previousStatus !== newStatus,
      order: updatedOrder,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error refreshing status";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
