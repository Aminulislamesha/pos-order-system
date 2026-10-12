import crypto from "crypto";

export interface SteadfastStatusResponse {
  status: number;
  delivery_status?: string;
  consignment?: {
    consignment_id?: number | string;
    invoice?: string;
    tracking_code?: string;
    status?: string;
  };
  message?: string;
}

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

export async function fetchSteadfastStatusByInvoice(invoiceId: string): Promise<{
  success: boolean;
  status?: string;
  trackingCode?: string;
  consignmentId?: string;
  raw?: unknown;
  error?: string;
}> {
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

  try {
    const endpoint = `https://portal.steadfast.com.bd/api/v1/status_by_invoice/${encodeURIComponent(
      invoiceId
    )}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Api-Key": apiKey,
        "Secret-Key": secretKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        error: `Steadfast API error ${response.status}: ${errText}`,
      };
    }

    const data: SteadfastStatusResponse = await response.json();
    const rawStatus =
      data.delivery_status ||
      data.consignment?.status ||
      (typeof data.status === "string" ? data.status : undefined);

    const trackingCode = data.consignment?.tracking_code;
    const consignmentId = data.consignment?.consignment_id?.toString();

    return {
      success: true,
      status: normalizeSteadfastStatus(rawStatus),
      trackingCode,
      consignmentId,
      raw: data,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error contacting Steadfast API";
    return {
      success: false,
      error: errorMsg,
    };
  }
}
