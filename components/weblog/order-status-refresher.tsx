"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderStatusRefresherProps {
  orderId: string;
  invoiceId: string;
  lastCheckedAt: string | null;
}

export function OrderStatusRefresher({
  orderId,
  invoiceId,
  lastCheckedAt,
}: OrderStatusRefresherProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [secondsRemaining, setSecondsRemaining] = React.useState<number>(0);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Initialize and tick countdown if last check was recent
  React.useEffect(() => {
    if (!lastCheckedAt) return;

    const lastTime = new Date(lastCheckedAt).getTime();
    const elapsed = Date.now() - lastTime;
    const remaining = Math.max(0, Math.ceil((60000 - elapsed) / 1000));

    if (remaining > 0) {
      setSecondsRemaining(remaining);
    }
  }, [lastCheckedAt]);

  React.useEffect(() => {
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const handleRefresh = async () => {
    if (secondsRemaining > 0) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/nn-weblog/orders/${orderId}/refresh-status`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.status === 429) {
        setSecondsRemaining(data.secondsRemaining || 60);
        setFeedback({
          type: "warning",
          message:
            data.message ||
            `Steadfast cache active. Please wait ${data.secondsRemaining}s before requesting again.`,
        });
      } else if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.error || "Failed to communicate with Steadfast API.",
        });
      } else {
        setSecondsRemaining(60); // Reset 60-second cooldown
        setFeedback({
          type: "success",
          message: data.statusChanged
            ? `Status updated successfully to "${data.order.status}"!`
            : "Status confirmed up-to-date with Steadfast.",
        });
        router.refresh();
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Network error refreshing courier status.",
      });
    } finally {
      setLoading(false);
    }
  };

  const isCoolingDown = secondsRemaining > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          onClick={handleRefresh}
          disabled={loading || isCoolingDown}
          size="sm"
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>
            {loading
              ? "Checking Steadfast..."
              : isCoolingDown
              ? `Cache Active (${secondsRemaining}s)`
              : "Refresh Live Status"}
          </span>
        </Button>

        {isCoolingDown && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono">
            <Clock className="h-3.5 w-3.5" />
            <span>Packzy 60s cache limit</span>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg p-2.5 text-xs animate-in fade-in ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : feedback.type === "warning"
              ? "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
              : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          {feedback.type === "success" && <CheckCircle className="h-4 w-4 flex-shrink-0" />}
          {feedback.type === "warning" && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
          {feedback.type === "error" && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
