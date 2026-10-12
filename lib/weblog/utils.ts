import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "৳0.00";
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace("BDT", "৳");
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function cleanPhoneNumber(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.trim().replace(/^[`'"]+|[`'"]+$/g, "").replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+880")) {
    cleaned = "0" + cleaned.slice(4);
  } else if (cleaned.startsWith("880")) {
    cleaned = "0" + cleaned.slice(3);
  }
  return cleaned;
}

export function parseDateToYMD(val: string | null | undefined): string {
  if (!val) return new Date().toISOString().split("T")[0];
  const str = val.trim().replace(/^[`'"]+|[`'"]+$/g, "");
  if (!str) return new Date().toISOString().split("T")[0];

  // Case 1: Starts with YYYY-MM-DD or YYYY/MM/DD (e.g. "2026-10-10 19:13", "2026-10-10 12:08:31 +0600")
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, "0");
    const d = ymdMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Case 2: Starts with DD-MM-YYYY or DD/MM/YYYY or MM/DD/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    let d = p1;
    let m = p2;
    if (p1 <= 12 && p2 > 12) {
      m = p1;
      d = p2;
    }
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Case 3: Fallback standard Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().split("T")[0];
}

export function isExchangeOrResendInvoice(invoiceId: string | null | undefined): boolean {
  if (!invoiceId) return false;
  const inv = invoiceId.trim().toLowerCase();
  return /-(?:\d+|exc|exchange|resend)(?:-(?:\d+|exc|exchange|resend))*$/i.test(inv);
}

export function getBaseInvoiceId(invoiceId: string | null | undefined): string {
  if (!invoiceId) return "";
  const trimmed = invoiceId.trim();
  return trimmed.replace(/-(?:\d+|exc|exchange|resend)(?:-(?:\d+|exc|exchange|resend))*$/i, "");
}
