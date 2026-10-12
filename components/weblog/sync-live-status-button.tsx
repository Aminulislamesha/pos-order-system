"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  Truck,
  Package,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SyncLiveStatusButtonProps {
  pendingCount?: number;
  currentPageOrderIds?: string[];
  variant?: "default" | "outline" | "compact";
  label?: string;
}

export function SyncLiveStatusButton({
  pendingCount = 0,
  currentPageOrderIds = [],
  variant = "default",
  label = "Sync Live Status",
}: SyncLiveStatusButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);

  // Sync runner state
  const [isRunning, setIsRunning] = React.useState(false);
  const [isFinished, setIsFinished] = React.useState(false);
  const [syncMode, setSyncMode] = React.useState<"page" | "all" | null>(null);

  // Live statistics
  const [totalInitialPending, setTotalInitialPending] = React.useState(pendingCount);
  const [processedCount, setProcessedCount] = React.useState(0);
  const [updatedCount, setUpdatedCount] = React.useState(0);
  const [deliveredCount, setDeliveredCount] = React.useState(0);
  const [inTransitCount, setInTransitCount] = React.useState(0);
  const [cancelledCount, setCancelledCount] = React.useState(0);
  const [remainingPending, setRemainingPending] = React.useState(pendingCount);
  const [currentBatchMessage, setCurrentBatchMessage] = React.useState<string>("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Auto-sync preference
  const [autoSyncEnabled, setAutoSyncEnabled] = React.useState(false);

  const stopRequestedRef = React.useRef(false);

  React.useEffect(() => {
    setTotalInitialPending(pendingCount);
    setRemainingPending(pendingCount);
  }, [pendingCount]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("nn_weblog_auto_sync");
      if (stored === "true") {
        setAutoSyncEnabled(true);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleAutoSync = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    try {
      localStorage.setItem("nn_weblog_auto_sync", enabled ? "true" : "false");
    } catch {
      // Ignore
    }
  };

  // Optional background auto-sync on mount if enabled
  React.useEffect(() => {
    if (
      autoSyncEnabled &&
      currentPageOrderIds.length > 0 &&
      pendingCount > 0 &&
      !isRunning &&
      !isFinished
    ) {
      // Silently sync current page orders in the background
      handleSyncCurrentPage(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncEnabled]);

  const resetStats = () => {
    setProcessedCount(0);
    setUpdatedCount(0);
    setDeliveredCount(0);
    setInTransitCount(0);
    setCancelledCount(0);
    setIsFinished(false);
    setErrorMessage(null);
    setCurrentBatchMessage("");
    stopRequestedRef.current = false;
  };

  const handleSyncCurrentPage = async (silent = false) => {
    if (currentPageOrderIds.length === 0) {
      setErrorMessage("No orders visible on the current page to sync.");
      return;
    }

    if (!silent) {
      resetStats();
      setIsRunning(true);
      setSyncMode("page");
      setCurrentBatchMessage(`Syncing ${currentPageOrderIds.length} orders on this page...`);
    }

    try {
      const res = await fetch("/api/nn-weblog/orders/sync-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: currentPageOrderIds,
          limit: currentPageOrderIds.length,
          onlyPending: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Sync request failed (${res.status})`);
      }

      const data = await res.json();
      if (!silent) {
        setProcessedCount(data.processed || currentPageOrderIds.length);
        setUpdatedCount(data.updated || 0);

        if (Array.isArray(data.results)) {
          let del = 0, trans = 0, canc = 0;
          for (const r of data.results) {
            if (r.newStatus === "delivered") del++;
            else if (r.newStatus === "in_transit") trans++;
            else if (r.newStatus === "cancelled") canc++;
          }
          setDeliveredCount(del);
          setInTransitCount(trans);
          setCancelledCount(canc);
        }

        if (typeof data.remainingPending === "number") {
          setRemainingPending(data.remainingPending);
        }

        setIsFinished(true);
        setCurrentBatchMessage("Page sync complete!");
      }

      router.refresh();
    } catch (err) {
      if (!silent) {
        setErrorMessage(err instanceof Error ? err.message : "Error syncing page orders.");
      }
    } finally {
      if (!silent) {
        setIsRunning(false);
      }
    }
  };

  const handleSyncAllPending = async () => {
    resetStats();
    setIsRunning(true);
    setSyncMode("all");
    stopRequestedRef.current = false;

    let processedAccum = 0;
    let updatedAccum = 0;
    let deliveredAccum = 0;
    let inTransitAccum = 0;
    let cancelledAccum = 0;

    try {
      while (!stopRequestedRef.current) {
        setCurrentBatchMessage(`Querying Steadfast batch (up to 20 orders)...`);

        const res = await fetch("/api/nn-weblog/orders/sync-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            limit: 20,
            onlyPending: true,
          }),
        });

        if (!res.ok) {
          throw new Error(`Batch request failed with status ${res.status}`);
        }

        const data = await res.json();
        const batchProcessed = data.processed || 0;
        const batchUpdated = data.updated || 0;

        if (batchProcessed === 0) {
          // No more orders needing check
          break;
        }

        processedAccum += batchProcessed;
        updatedAccum += batchUpdated;

        if (Array.isArray(data.results)) {
          for (const r of data.results) {
            if (r.newStatus === "delivered") deliveredAccum++;
            else if (r.newStatus === "in_transit") inTransitAccum++;
            else if (r.newStatus === "cancelled") cancelledAccum++;
          }
        }

        setProcessedCount(processedAccum);
        setUpdatedCount(updatedAccum);
        setDeliveredCount(deliveredAccum);
        setInTransitCount(inTransitAccum);
        setCancelledCount(cancelledAccum);

        if (typeof data.remainingPending === "number") {
          setRemainingPending(data.remainingPending);
          if (data.remainingPending === 0) {
            break;
          }
        }

        setCurrentBatchMessage(`Checked ${processedAccum} orders (${updatedAccum} status changes applied)...`);

        // Check if user requested stop
        if (stopRequestedRef.current) {
          break;
        }

        // Brief 300ms pause between batches for smooth UX
        await new Promise((r) => setTimeout(r, 300));
      }

      setIsFinished(true);
      setCurrentBatchMessage(
        stopRequestedRef.current
          ? "Sync stopped by user."
          : "All pending orders synchronized with Steadfast!"
      );
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Sync loop encountered an error.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    setCurrentBatchMessage("Stopping sync after current batch...");
  };

  const percentProgress =
    totalInitialPending > 0
      ? Math.min(100, Math.round((processedCount / totalInitialPending) * 100))
      : 100;

  return (
    <>
      {/* Trigger Button */}
      {variant === "compact" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="gap-1.5 h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
          title="Sync Steadfast courier delivery status"
        >
          <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
          <span>{label}</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-indigo-100 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200">
              {pendingCount}
            </span>
          )}
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={() => setIsOpen(true)}
          className="gap-2 shadow-sm bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-medium cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          <span>{label}</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-mono font-semibold">
              {pendingCount}
            </span>
          )}
        </Button>
      )}

      {/* Synchronizer Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/30">
                  <RefreshCw
                    className={`h-5 w-5 ${isRunning ? "animate-spin text-indigo-600" : ""}`}
                  />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Steadfast Live Courier Synchronizer
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live Packzy / Steadfast status check & bulk database updater
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (isRunning) handleStop();
                  setIsOpen(false);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* System Status Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="text-[11px] font-semibold uppercase text-slate-400">
                  Pending in Database
                </div>
                <div className="text-xl font-bold text-amber-600 mt-0.5">
                  {remainingPending.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Awaiting live courier confirmation</div>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="text-[11px] font-semibold uppercase text-slate-400">
                  Visible Page Orders
                </div>
                <div className="text-xl font-bold text-blue-600 mt-0.5">
                  {currentPageOrderIds.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Orders in current view</div>
              </div>
            </div>

            {/* Progress Bar (when active or finished) */}
            {(isRunning || isFinished) && (
              <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-950/60 dark:bg-indigo-950/30">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    {isRunning ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    {currentBatchMessage || "Synchronizing..."}
                  </span>
                  <span className="font-mono text-indigo-700 dark:text-indigo-300 font-semibold">
                    {syncMode === "all" ? `${percentProgress}%` : `${processedCount} done`}
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-200/60 dark:bg-indigo-900/40">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isFinished ? "bg-emerald-600" : "bg-indigo-600"
                    }`}
                    style={{
                      width:
                        syncMode === "all"
                          ? `${Math.max(5, percentProgress)}%`
                          : "100%",
                    }}
                  />
                </div>

                {/* Status Breakdown Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    ✓ Delivered: {deliveredCount}
                  </span>
                  <span className="rounded-md bg-blue-100 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                    🚚 In Transit: {inTransitCount}
                  </span>
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                    ✗ Cancelled: {cancelledCount}
                  </span>
                  <span className="rounded-md bg-slate-200/80 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Checked: {processedCount}
                  </span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3 pt-1">
              {!isRunning ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Button
                    type="button"
                    onClick={() => handleSyncCurrentPage(false)}
                    variant="outline"
                    className="w-full justify-center gap-2 border-slate-300 text-xs font-semibold h-10 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Layers className="h-4 w-4 text-blue-600" />
                    <span>Sync Current Page ({currentPageOrderIds.length})</span>
                  </Button>

                  <Button
                    type="button"
                    onClick={handleSyncAllPending}
                    className="w-full justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold h-10 shadow-sm cursor-pointer"
                  >
                    <Play className="h-4 w-4" />
                    <span>Sync All Pending ({remainingPending})</span>
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleStop}
                  className="w-full justify-center gap-2 h-10 text-xs font-semibold cursor-pointer"
                >
                  <Square className="h-4 w-4" />
                  <span>Stop / Pause Synchronization</span>
                </Button>
              )}

              {/* Background Auto-sync preference toggle */}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/50">
                <span className="text-[11px] font-medium">
                  Auto-sync visible orders when viewing Orders page
                </span>
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(e) => toggleAutoSync(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (isRunning) handleStop();
                  setIsOpen(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                {isFinished ? "Done" : "Close"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
