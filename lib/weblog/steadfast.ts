import crypto from "crypto";
import { getBaseInvoiceId } from "@/lib/weblog/utils";
import { fetchConsignmentNotesFromFirebase } from "@/lib/weblog/firebase-notes";

export interface SteadfastStatusResponse {
  status: number;
  delivery_status?: string;
  cod_amount?: number;
  delivery_charge?: number;
  consignment?: {
    consignment_id?: number | string;
    invoice?: string;
    tracking_code?: string;
    status?: string;
    cod_amount?: number;
    delivery_charge?: number;
  };
  message?: string;
}

export interface SteadfastSyncResult {
  success: boolean;
  status?: string;
  trackingCode?: string;
  consignmentId?: string;
  codAmount?: number;
  deliveryCharge?: number;
  netReceivable?: number;
  steadfastCreatedAt?: Date | null;
  deliveryDate?: Date | null;
  returnDate?: Date | null;
  returnStatus?: string | null;
  cancellationType?: string | null;
  cancelReason?: string | null;
  requiresManualReview?: boolean;
  manualReviewStatus?: string | null;
  trackingSteps?: Array<{ text: string; created_at: string }>;
  raw?: unknown;
  error?: string;
}

/**
 * Normalizes varied Steadfast/Packzy status strings into standard system statuses:
 * 'pending' | 'in_transit' | 'delivered' | 'partial_delivered' | 'cancelled' | 'hold'
 */
export function normalizeSteadfastStatus(rawStatus: string | undefined | null): string {
  if (!rawStatus) return "pending";
  const s = rawStatus.toLowerCase().trim().replace(/[\s_-]+/g, "_");

  if (s.includes("delivered") && !s.includes("partial")) {
    return "delivered";
  }
  if (s.includes("partial")) {
    return "partial_delivered";
  }
  if (s.includes("cancel") || s.includes("return")) {
    return "cancelled";
  }
  if (s.includes("hold") || s.includes("delay")) {
    return "hold";
  }
  if (s.includes("transit") || s.includes("dispatch") || s.includes("out_for_delivery")) {
    return "in_transit";
  }
  if (s.includes("pending") || s.includes("review") || s.includes("accepted")) {
    return "pending";
  }

  return s;
}

/**
 * Verifies Steadfast HMAC-SHA256 signature using timing-safe comparison
 */
export function verifySteadfastSignature(
  rawBody: string,
  providedSignature: string | null | undefined,
  secret: string
): boolean {
  if (!providedSignature || !secret) return false;

  try {
    const computed = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const sigBuffer = Buffer.from(providedSignature.toLowerCase(), "hex");
    const compBuffer = Buffer.from(computed.toLowerCase(), "hex");

    if (sigBuffer.length !== compBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, compBuffer);
  } catch {
    return false;
  }
}

/**
 * Fetches status, tracking timeline, CID return status, and Firebase notes for an invoice.
 */
export async function fetchSteadfastStatusByInvoice(
  invoiceId: string,
  existingOrderData?: {
    cod_amount?: number;
    delivery_charge?: number;
    consignment_id?: string | null;
  }
): Promise<SteadfastSyncResult> {
  const apiKey = process.env.STEADFAST_API_KEY;
  const secretKey = process.env.STEADFAST_SECRET_KEY;

  if (!apiKey || !secretKey || apiKey === "your_steadfast_api_key_here" || apiKey === "test_api_key") {
    return {
      success: true,
      status: "delivered",
      trackingCode: `ST-${invoiceId.slice(-6)}`,
      raw: { simulated: true, note: "Steadfast keys in .env are placeholder/test" },
    };
  }

  const trimmedInvoice = invoiceId.trim();
  const invoiceCandidates = [trimmedInvoice];
  const baseInv = getBaseInvoiceId(trimmedInvoice);
  if (baseInv && baseInv !== trimmedInvoice) {
    invoiceCandidates.push(baseInv);
  }

  const host = "https://portal.packzy.com";
  const headers = {
    "Api-Key": apiKey,
    "Secret-Key": secretKey,
    "Content-Type": "application/json",
  };

  let lastError = "Unable to connect to Packzy / Steadfast Courier API";

  for (const inv of invoiceCandidates) {
    try {
      // 1. Fetch live status
      const statusUrl = `${host}/api/v1/status_by_invoice/${encodeURIComponent(inv)}`;
      const statusRes = await fetch(statusUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (statusRes.status === 404) continue;
      if (!statusRes.ok) {
        lastError = `Courier API error (${statusRes.status}): ${await statusRes.text()}`;
        continue;
      }

      const statusData: SteadfastStatusResponse = await statusRes.json();
      const rawStatus =
        statusData.delivery_status ||
        statusData.consignment?.status ||
        (typeof statusData.status === "string" ? statusData.status : undefined);

      let normalizedStatus = normalizeSteadfastStatus(rawStatus);
      let trackingCode = statusData.consignment?.tracking_code;
      let consignmentId = statusData.consignment?.consignment_id?.toString() || existingOrderData?.consignment_id || undefined;

      let codAmount =
        typeof statusData.cod_amount === "number"
          ? statusData.cod_amount
          : typeof statusData.consignment?.cod_amount === "number"
          ? statusData.consignment.cod_amount
          : existingOrderData?.cod_amount || 0.0;

      let deliveryCharge =
        typeof statusData.delivery_charge === "number"
          ? statusData.delivery_charge
          : typeof statusData.consignment?.delivery_charge === "number"
          ? statusData.consignment.delivery_charge
          : existingOrderData?.delivery_charge || 0.0;

      let steadfastCreatedAt: Date | null = null;
      let deliveryDate: Date | null = null;
      let returnDate: Date | null = null;
      let returnStatus: string | null = null;
      let trackingSteps: Array<{ text: string; created_at: string }> = [];

      // 2. Fetch trackings timeline
      try {
        const trackingsUrl = `${host}/api/v1/trackings_by_invoice/${encodeURIComponent(inv)}`;
        const trackingsRes = await fetch(trackingsUrl, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(5000),
        });

        if (trackingsRes.ok) {
          const trackingsData = await trackingsRes.json();
          const list = trackingsData?.tracking;
          if (Array.isArray(list) && list.length > 0) {
            // First item gives consignment_id and initial entry time
            if (!consignmentId && list[0].consignment_id) {
              consignmentId = String(list[0].consignment_id);
            }
            if (list[0].created_at) {
              steadfastCreatedAt = new Date(list[0].created_at);
            }

            trackingSteps = list.map((item: any) => ({
              text: item.text || "",
              created_at: item.created_at || "",
            }));

            // Search for delivery milestone
            for (const step of list) {
              const txt = (step.text || "").toLowerCase();
              if (txt.includes("marked as delivered") || txt.includes("delivered by rider")) {
                deliveryDate = new Date(step.created_at);
              }
              if (txt.includes("return") || txt.includes("cancelled")) {
                returnDate = new Date(step.created_at);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed fetching trackings timeline:", err);
      }

      // 3. If consignmentId exists and status is cancelled or partial, check return status
      if (consignmentId && (normalizedStatus === "cancelled" || normalizedStatus === "partial_delivered")) {
        try {
          const returnStatusUrl = `${host}/api/v1/status_with_return_status_by_cid/${encodeURIComponent(
            consignmentId
          )}`;
          const retRes = await fetch(returnStatusUrl, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(4000),
          });
          if (retRes.ok) {
            const retData = await retRes.json();
            returnStatus = retData.delivery_status || null;
          }
        } catch (err) {
          console.warn("Failed fetching return status by CID:", err);
        }
      }

      // 4. Financial Calculations & COD < 200 rule
      // Rule: If parcel COD < 200, mark as Canceled
      let cancellationType: string | null = null;
      let requiresManualReview = false;
      let manualReviewStatus: string | null = null;

      if (codAmount < 200 && (normalizedStatus === "cancelled" || normalizedStatus === "partial_delivered" || codAmount > 0)) {
        normalizedStatus = "cancelled";
        cancellationType = codAmount > 0 ? "WITH_DELIVERY_CHARGE" : "WITHOUT_DELIVERY_CHARGE";
      } else if (normalizedStatus === "cancelled") {
        cancellationType = codAmount > 0 ? "WITH_DELIVERY_CHARGE" : "WITHOUT_DELIVERY_CHARGE";
      }

      // Rule: Partially canceled with COD >= 200 requires manual review
      if (normalizedStatus === "partial_delivered" && codAmount >= 200) {
        requiresManualReview = true;
        manualReviewStatus = "PARTIAL_DELIVERY_ITEMS";
      }

      const netReceivable = codAmount - deliveryCharge;

      // 5. Fetch Firebase notes if consignmentId exists
      let cancelReason: string | null = null;
      if (consignmentId) {
        try {
          const fb = await fetchConsignmentNotesFromFirebase(consignmentId);
          cancelReason = fb.primaryCancelNote || fb.latestNote || null;
        } catch (err) {
          console.warn("Failed fetching Firebase notes:", err);
        }
      }

      return {
        success: true,
        status: normalizedStatus,
        trackingCode,
        consignmentId,
        codAmount,
        deliveryCharge,
        netReceivable,
        steadfastCreatedAt,
        deliveryDate,
        returnDate,
        returnStatus,
        cancellationType,
        cancelReason,
        requiresManualReview,
        manualReviewStatus,
        trackingSteps,
        raw: statusData,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : "Network error contacting Steadfast API";
    }
  }

  return {
    success: false,
    error: lastError,
  };
}
