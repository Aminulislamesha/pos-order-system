"use client";

import * as React from "react";
import { RefreshCw, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface InlineRowStatusRefresherProps {
  orderId: string;
  invoiceId: string;
  initialStatus: string;
}

export function InlineRowStatusRefresher({
  orderId,
  invoiceId,
  initialStatus,
}: InlineRowStatusRefresherProps) {
  const [status, setStatus] = React.useState(initialStatus);
  const [loading, setLoading] = React.useState(false);
  const [justUpdated, setJustUpdated] = React.useState(false);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/nn-weblog/orders/${orderId}/refresh-status?force=true`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.order && data.order.status) {
          setStatus(data.order.status);
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 3000);
        }
      }
    } catch (err) {
      console.error("Inline refresh error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 group">
      <Badge status={status} className="capitalize">
        {status}
      </Badge>

      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        title={`Check live Steadfast status for ${invoiceId}`}
        className="opacity-60 group-hover:opacity-100 hover:text-blue-600 dark:hover:text-blue-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-400 disabled:opacity-40"
      >
        {justUpdated ? (
          <Check className="h-3 w-3 text-emerald-600 animate-in fade-in" />
        ) : (
          <RefreshCw
            className={`h-3 w-3 transition-transform ${
              loading ? "animate-spin text-blue-600" : ""
            }`}
          />
        )}
      </button>
    </div>
  );
}
