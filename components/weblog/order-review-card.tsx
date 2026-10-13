"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  RotateCcw,
  Loader2,
  Calendar,
  Phone,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/weblog/utils";

interface OrderReviewCardProps {
  order: {
    id: string;
    invoice_id: string;
    date: Date | string;
    total_bill: number;
    delivery_charge: number;
    cod_amount?: number | null;
    net_receivable?: number | null;
    status: string;
    details?: string | null;
    manual_review_status?: string | null;
    requires_manual_review: boolean;
    returned_items?: any;
    customer: {
      id: string;
      name: string;
      phone: string;
    };
  };
}

export function OrderReviewCard({ order }: OrderReviewCardProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolved, setIsResolved] = useState(!order.requires_manual_review);

  // Extract items from order.details
  const rawDetails = order.details || "";
  let itemsContent = rawDetails;
  let notePrefix = "";
  const match = rawDetails.match(/^(\[[^\]]+\])\s*(.*)$/);
  if (match) {
    notePrefix = match[1];
    itemsContent = match[2];
  }

  // Split into parsed item chunks
  const parsedItems = itemsContent
    ? itemsContent
        .split(/,\s*(?=[^,]+?\s*(?:\(x\d+\)|$))/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Initial returned items from order record
  const initialReturned: string[] = [];
  if (Array.isArray(order.returned_items)) {
    for (const item of order.returned_items) {
      if (typeof item === "string") initialReturned.push(item);
      else if (item && typeof item === "object") {
        initialReturned.push(item.name || item.product || item.text || "");
      }
    }
  }

  const [selectedReturned, setSelectedReturned] = useState<string[]>(initialReturned);
  const [staffNote, setStaffNote] = useState("");

  const toggleItemReturned = (itemStr: string) => {
    if (selectedReturned.includes(itemStr)) {
      setSelectedReturned(selectedReturned.filter((i) => i !== itemStr));
    } else {
      setSelectedReturned([...selectedReturned, itemStr]);
    }
  };

  const handleResolve = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/nn-weblog/orders/${order.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returned_items: selectedReturned,
          mark_resolved: true,
          resolution_note: staffNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update review status");
      }

      setIsResolved(true);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error saving review");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExchangeMismatch = order.manual_review_status === "EXCHANGE_MISMATCH";
  const isPartialDelivery =
    order.manual_review_status === "PARTIAL_DELIVERY_ITEMS" ||
    order.status === "partial_delivered";

  const cod = order.cod_amount || 0;
  const netRec =
    order.net_receivable !== null && order.net_receivable !== undefined
      ? order.net_receivable
      : Math.max(0, (order.cod_amount || order.total_bill) - order.delivery_charge);

  return (
    <div
      className={`rounded-2xl border p-5 transition-all ${
        isResolved
          ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-950 dark:bg-emerald-950/10"
          : "border-amber-200 bg-white shadow-xs dark:border-amber-900/60 dark:bg-slate-900"
      }`}
    >
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
              {order.invoice_id}
            </span>

            {isExchangeMismatch ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <RotateCcw className="h-3 w-3" />
                Exchange Mismatch
              </span>
            ) : isPartialDelivery ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-3 w-3" />
                Partial Delivery Review
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Needs Review
              </span>
            )}

            {isResolved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Resolved
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(order.date)}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
              <User className="h-3 w-3" />
              {order.customer.name}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-mono text-slate-600 dark:text-slate-400">
              <Phone className="h-3 w-3" />
              {order.customer.phone}
            </span>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-200/60 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {formatCurrency(order.total_bill)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">COD</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {cod > 0 ? formatCurrency(cod) : "—"}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <span className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 block">
              Net Rec
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(netRec)}
            </span>
          </div>
        </div>
      </div>

      {/* Note / Context */}
      {notePrefix && (
        <div className="mt-3.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Note from Order:</strong> {notePrefix}
          </span>
        </div>
      )}

      {/* Items Checklist for Partial Cancellation or Exchange Selection */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-400">
          <span>Items from this order</span>
          <span className="text-[11px] font-normal normal-case text-slate-500">
            Check the items that were <strong>returned to warehouse</strong>:
          </span>
        </div>

        {parsedItems.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            No discrete items parsed from details: &quot;{rawDetails}&quot;
          </p>
        ) : (
          <div className="space-y-1.5">
            {parsedItems.map((item, idx) => {
              const isChecked = selectedReturned.includes(item);

              return (
                <label
                  key={idx}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? "border-rose-200 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200"
                      : "border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 dark:border-slate-800 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleItemReturned(item)}
                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <span className={isChecked ? "line-through text-rose-600 font-medium" : "font-medium"}>
                      {item}
                    </span>
                  </div>

                  <span className="text-[11px] font-medium">
                    {isChecked ? (
                      <span className="text-rose-600 dark:text-rose-400">Marked as Returned</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Customer Kept (Sold)</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Resolution Actions */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 max-w-sm">
          <input
            type="text"
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            placeholder="Staff review comment (optional)..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            size="sm"
            onClick={handleResolve}
            disabled={isSubmitting}
            className="gap-1.5 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3" />
                <span>Save Review &amp; Mark Resolved</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
