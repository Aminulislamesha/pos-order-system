"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResetWeblogButtonProps {
  onSuccess?: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
}

export function ResetWeblogButton({
  onSuccess,
  variant = "outline",
  size = "sm",
  className = "",
  label = "Reset All Data",
}: ResetWeblogButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleReset = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/nn-weblog/reset", {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset application data");
      }

      setSuccessMsg(
        `Application reset! Cleared ${data.counts?.orders ?? 0} orders and ${data.counts?.customers ?? 0} customers.`
      );

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        setIsOpen(false);
        setSuccessMsg(null);
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error resetting data";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setIsOpen(true)}
        className={`gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 ${className}`}
      >
        <RotateCcw className="h-3.5 w-3.5 text-rose-500" />
        <span>{label}</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/50">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Reset NN Weblog Data
                </h3>
                <p className="text-xs text-slate-500">
                  Permanent data clearance
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              This action will permanently delete all <strong>Orders</strong>, <strong>Customers</strong>, and <strong>Tracking History</strong> in NN Weblog. 
              <br /><br />
              <span className="text-xs text-slate-400 block">
                • POS Inventory and store products are completely untouched.
                <br />
                • You will get a totally fresh, empty Weblog application.
              </span>
            </p>

            {successMsg && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300">
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => {
                  setIsOpen(false);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={loading}
                onClick={handleReset}
                className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Yes, Reset All Data</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
