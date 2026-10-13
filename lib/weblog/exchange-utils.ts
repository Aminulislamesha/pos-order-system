/**
 * Utilities for Exchange (-exc) and Partial Delivery orders
 */

/**
 * Extracts the number of returned pants noted in the order note/details.
 * Examples matched:
 * - "Exchange (2 return pants)"
 * - "Exchange (3 return pant)"
 * - "C, VU12, Exchange (2 return pants)"
 * - "Exchange 2 return"
 * - "2 return pants"
 * - "2 return pant"
 */
export function extractReturnedPantsCount(note: string | null | undefined): number | null {
  if (!note) return null;
  const s = note.trim();

  // Pattern 1: Exchange (N return pant/pants)
  const p1 = s.match(/exchange\s*\(\s*(\d+)\s*return\s*pants?\s*\)/i);
  if (p1) return parseInt(p1[1], 10);

  // Pattern 2: (N return pant/pants)
  const p2 = s.match(/\(\s*(\d+)\s*return\s*pants?\s*\)/i);
  if (p2) return parseInt(p2[1], 10);

  // Pattern 3: N return pant/pants
  const p3 = s.match(/(\d+)\s*return\s*pants?/i);
  if (p3) return parseInt(p3[1], 10);

  // Pattern 4: Exchange N return
  const p4 = s.match(/exchange\s*\(?\s*(\d+)\s*return/i);
  if (p4) return parseInt(p4[1], 10);

  return null;
}

/**
 * Calculates total item/pant quantity being sent in an order from items or details text.
 */
export function calculateSentItemsCount(
  items?: Array<{ product: string; quantity: string | number }> | null,
  details?: string | null
): number {
  let count = 0;

  if (Array.isArray(items) && items.length > 0) {
    for (const it of items) {
      const q = typeof it.quantity === "number" ? it.quantity : parseInt(String(it.quantity || "1"), 10);
      if (!isNaN(q) && q > 0) {
        count += q;
      }
    }
    if (count > 0) return count;
  }

  // Fallback: parse (xN) or product quantities from details text
  if (details) {
    const qtyMatches = details.match(/\(x(\d+)\)/g);
    if (qtyMatches) {
      for (const m of qtyMatches) {
        const num = parseInt(m.replace(/\D/g, ""), 10);
        if (!isNaN(num)) count += num;
      }
    }
  }

  return count || 1;
}

/**
 * Analyzes an exchange invoice and returns review requirements.
 */
export function analyzeExchangeOrder(
  invoiceId: string,
  note: string,
  items?: Array<{ product: string; quantity: string | number }>
): {
  isExchange: boolean;
  returnedPants: number | null;
  sentPants: number;
  requiresReview: boolean;
  reviewReason: string | null;
} {
  const isExc = /-exc|-exchange/i.test(invoiceId.trim());
  if (!isExc) {
    return {
      isExchange: false,
      returnedPants: null,
      sentPants: 0,
      requiresReview: false,
      reviewReason: null,
    };
  }

  const returnedPants = extractReturnedPantsCount(note);
  const sentPants = calculateSentItemsCount(items, note);

  // If note specifies returned pants, compare with sent pants
  if (returnedPants !== null) {
    if (sentPants > returnedPants) {
      // Sending more than returned (e.g. sending 3 pants, 2 returned) -> requires human review
      return {
        isExchange: true,
        returnedPants,
        sentPants,
        requiresReview: true,
        reviewReason: `EXCHANGE_MISMATCH: Sent ${sentPants} items, but note states ${returnedPants} return items.`,
      };
    }

    return {
      isExchange: true,
      returnedPants,
      sentPants,
      requiresReview: false,
      reviewReason: null,
    };
  }

  // If -exc suffix exists but no return quantity noted, flag for review
  return {
    isExchange: true,
    returnedPants: null,
    sentPants,
    requiresReview: true,
    reviewReason: "EXCHANGE_MISMATCH: Exchange invoice without clear return count in note.",
  };
}
