import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSteadfastStatus, verifySteadfastSignature } from "@/lib/weblog/steadfast";
import { ensureWeblogTables } from "@/lib/weblog/init-db";
import { getBaseInvoiceId } from "@/lib/weblog/utils";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get("x-signature") ||
      request.headers.get("X-Signature") ||
      request.headers.get("x-packzy-signature");

    const authHeader =
      request.headers.get("authorization") ||
      request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader?.trim();

    const explicitWebhookSecret = process.env.STEADFAST_WEBHOOK_SECRET || "";
    const apiKey = process.env.STEADFAST_API_KEY || "";
    const secretKey = process.env.STEADFAST_SECRET_KEY || "";

    const apiKeyHeader =
      request.headers.get("api-key") ||
      request.headers.get("Api-Key") ||
      request.headers.get("x-api-key");
    const secretKeyHeader =
      request.headers.get("secret-key") ||
      request.headers.get("Secret-Key") ||
      request.headers.get("x-secret-key");

    // Only enforce strict token check if STEADFAST_WEBHOOK_SECRET is explicitly set
    if (explicitWebhookSecret && explicitWebhookSecret !== "test_webhook_secret_key") {
      const isBearerMatch = bearerToken && bearerToken === explicitWebhookSecret;
      const isSignatureValid = verifySteadfastSignature(rawBody, signature, explicitWebhookSecret);
      const isApiKeyMatch = apiKeyHeader === apiKey || secretKeyHeader === secretKey;

      if (!isBearerMatch && !isSignatureValid && !isApiKeyMatch) {
        return NextResponse.json(
          { error: "Invalid webhook credentials or token" },
          { status: 401 }
        );
      }
    }

    if (!rawBody) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    // Support flexible Steadfast / Packzy payload schemas
    const invoiceId =
      (payload.invoice as string) ||
      (payload.invoice_id as string) ||
      ((payload.consignment as Record<string, unknown>)?.invoice as string) ||
      ((payload.data as Record<string, unknown>)?.invoice as string) ||
      ((payload.data as Record<string, unknown>)?.invoice_id as string);

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Missing invoice identifier in webhook payload" },
        { status: 400 }
      );
    }

    const rawStatus =
      (payload.status as string) ||
      (payload.delivery_status as string) ||
      (payload.status_name as string) ||
      ((payload.consignment as Record<string, unknown>)?.status as string) ||
      ((payload.data as Record<string, unknown>)?.status as string);

    const newStatus = normalizeSteadfastStatus(rawStatus);

    const trackingCode =
      (payload.tracking_code as string) ||
      ((payload.consignment as Record<string, unknown>)?.tracking_code as string) ||
      null;

    const consignmentId =
      (payload.consignment_id?.toString() as string) ||
      (((payload.consignment as Record<string, unknown>)?.consignment_id)?.toString() as string) ||
      null;

    const message =
      (payload.message as string) ||
      (payload.note as string) ||
      (payload.remarks as string) ||
      `Steadfast Webhook event: ${rawStatus || newStatus}`;

    // Lookup order with fallback to base invoice or consignment id
    await ensureWeblogTables();
    let order = await prisma.order.findFirst({
      where: { invoice_id: invoiceId },
      orderBy: { date: "desc" },
    });

    if (!order) {
      const baseInv = getBaseInvoiceId(invoiceId);
      if (baseInv && baseInv !== invoiceId) {
        order = await prisma.order.findFirst({
          where: { invoice_id: baseInv },
          orderBy: { date: "desc" },
        });
      }
    }

    if (!order && consignmentId) {
      order = await prisma.order.findFirst({
        where: { consignment_id: consignmentId },
        orderBy: { date: "desc" },
      });
    }

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message: `Order with invoice ${invoiceId} not found in database`,
        },
        { status: 404 }
      );
    }

    // Extract COD and Delivery Charge
    const rawCod = payload.cod_amount ?? (payload.consignment as Record<string, unknown>)?.cod_amount;
    const rawDeliveryCharge = payload.delivery_charge ?? (payload.consignment as Record<string, unknown>)?.delivery_charge;

    const codAmount = typeof rawCod === "number" ? rawCod : order.cod_amount;
    const deliveryCharge = typeof rawDeliveryCharge === "number" ? rawDeliveryCharge : order.delivery_charge;
    const netReceivable = codAmount - deliveryCharge;

    // Apply COD < 200 Rule
    let effectiveStatus = newStatus;
    let cancellationType: string | null = order.cancellation_type;
    let requiresManualReview = order.requires_manual_review;
    let manualReviewStatus = order.manual_review_status;

    if (codAmount < 200 && (effectiveStatus === "cancelled" || effectiveStatus === "partial_delivered" || codAmount > 0)) {
      effectiveStatus = "cancelled";
      cancellationType = codAmount > 0 ? "WITH_DELIVERY_CHARGE" : "WITHOUT_DELIVERY_CHARGE";
    } else if (effectiveStatus === "cancelled") {
      cancellationType = codAmount > 0 ? "WITH_DELIVERY_CHARGE" : "WITHOUT_DELIVERY_CHARGE";
    }

    // Check Partial Delivery with COD >= 200
    if (effectiveStatus === "partial_delivered" && codAmount >= 200) {
      requiresManualReview = true;
      manualReviewStatus = "PARTIAL_DELIVERY_ITEMS";
    }

    const previousStatus = order.status;
    const now = new Date();

    const deliveryDate = effectiveStatus === "delivered" ? order.delivery_date || now : order.delivery_date;
    const returnDate = effectiveStatus === "cancelled" ? order.return_date || now : order.return_date;

    const updateData: Record<string, unknown> = {
      status: effectiveStatus,
      tracking_code: trackingCode || order.tracking_code,
      consignment_id: consignmentId || order.consignment_id,
      cod_amount: codAmount,
      delivery_charge: deliveryCharge,
      net_receivable: netReceivable,
      cancellation_type: cancellationType,
      requires_manual_review: requiresManualReview,
      manual_review_status: manualReviewStatus,
      delivery_date: deliveryDate,
      return_date: returnDate,
      last_status_checked_at: now,
    };

    // Check if status actually changed or needs history entry
    if (previousStatus !== effectiveStatus) {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: updateData,
        }),
        prisma.trackingHistory.create({
          data: {
            order_id: order.id,
            previous_status: previousStatus,
            new_status: effectiveStatus,
            message: message,
            timestamp: now,
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        updated: true,
        invoice_id: invoiceId,
        previous_status: previousStatus,
        new_status: effectiveStatus,
        cod_amount: codAmount,
        net_receivable: netReceivable,
      });
    }

    // Status was the same, update financial fields and tracking metadata
    await prisma.order.update({
      where: { id: order.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      updated: false,
      message: "Status unchanged, financials updated",
      invoice_id: invoiceId,
      current_status: previousStatus,
      cod_amount: codAmount,
      net_receivable: netReceivable,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Webhook processing failed";
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
