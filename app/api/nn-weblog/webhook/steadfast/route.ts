import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSteadfastStatus, verifySteadfastSignature } from "@/lib/weblog/steadfast";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

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

    const webhookSecret =
      process.env.STEADFAST_WEBHOOK_SECRET || process.env.STEADFAST_SECRET_KEY || "";

    // Signature / Token verification if secret is configured
    if (webhookSecret && webhookSecret !== "test_webhook_secret_key") {
      const isBearerMatch = bearerToken && bearerToken === webhookSecret;
      const isSignatureValid = verifySteadfastSignature(rawBody, signature, webhookSecret);

      if (!isBearerMatch && !isSignatureValid) {
        return NextResponse.json(
          { error: "Invalid webhook signature or authorization token" },
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

    // Lookup order
    await ensureWeblogTables();
    const order = await prisma.order.findFirst({
      where: { invoice_id: invoiceId },
      orderBy: { date: "desc" },
    });

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message: `Order with invoice ${invoiceId} not found in database`,
        },
        { status: 404 }
      );
    }

    const previousStatus = order.status;

    // Check if status actually changed or needs history entry
    if (previousStatus !== newStatus) {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: newStatus,
            tracking_code: trackingCode || order.tracking_code,
            consignment_id: consignmentId || order.consignment_id,
            last_status_checked_at: new Date(),
          },
        }),
        prisma.trackingHistory.create({
          data: {
            order_id: order.id,
            previous_status: previousStatus,
            new_status: newStatus,
            message: message,
            timestamp: new Date(),
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        updated: true,
        invoice_id: invoiceId,
        previous_status: previousStatus,
        new_status: newStatus,
      });
    }

    // Status was the same, just touch last_status_checked_at and tracking code if present
    await prisma.order.update({
      where: { id: order.id },
      data: {
        tracking_code: trackingCode || order.tracking_code,
        consignment_id: consignmentId || order.consignment_id,
        last_status_checked_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updated: false,
      message: "Status unchanged",
      invoice_id: invoiceId,
      current_status: previousStatus,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Webhook processing failed";
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
