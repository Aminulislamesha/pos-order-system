"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function StatementUploader() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isReconciling, setIsReconciling] = React.useState(false);
  const [result, setResult] = React.useState<{
    success: boolean;
    message: string;
    reconciledOrders?: number;
    pendingForFuture?: number;
    savedRows?: number;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rawTextModalOpen, setRawTextModalOpen] = React.useState(false);
  const [rawText, setRawText] = React.useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/nn-weblog/statements/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process statement file");
      }

      setResult(data);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error uploading file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePasteSubmit = async () => {
    if (!rawText.trim()) return;

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/nn-weblog/statements/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: rawText }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse pasted text");
      }

      setResult(data);
      setRawTextModalOpen(false);
      setRawText("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error processing pasted statement");
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualReconcile = async () => {
    setIsReconciling(true);
    setError(null);

    try {
      const res = await fetch("/api/nn-weblog/statements/reconcile", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run reconciliation");

      setResult({
        success: true,
        message: data.message,
        reconciledOrders: data.reconciledCount,
        pendingForFuture: data.remainingPending,
      });
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reconciliation error");
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <span>Upload Steadfast Payment Statement</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualReconcile}
              disabled={isReconciling || isUploading}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isReconciling ? "animate-spin text-blue-500" : ""}`} />
              <span>{isReconciling ? "Reconciling..." : "Re-run Matching"}</span>
            </Button>
          </CardTitle>
          <CardDescription>
            Upload your Excel (.xlsx / .xls) or CSV statement from Steadfast. The system will record all rows, reconcile matched orders immediately with exact COD & delivery charges, and keep unmatched rows ready for future orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/20 transition-all"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 mb-3">
              <Upload className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {isUploading ? "Uploading & Processing Statement..." : "Click to select or drag & drop Steadfast Excel / CSV file"}
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Supports .xlsx, .xls, and .csv export files directly from Steadfast Courier Portal.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              Alternatively, paste CSV/TSV table text directly.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRawTextModalOpen(true)}
              className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              Paste Statement Text
            </Button>
          </div>

          {result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{result.message}</p>
                {result.reconciledOrders !== undefined && (
                  <p className="text-xs mt-1 opacity-90">
                    Reconciled: <strong>{result.reconciledOrders}</strong> orders | Stored for future orders: <strong>{result.pendingForFuture}</strong> rows.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raw Text Modal */}
      {rawTextModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Paste Steadfast Statement Rows</span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRawTextModalOpen(false)}
                className="h-8 w-8 p-0"
              >
                ✕
              </Button>
            </div>
            <textarea
              rows={10}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste comma or tab-separated statement lines here including header (Order ID, Tracking Code, Invoice, COD Amount, Shipping Charge...)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs dark:border-slate-800 dark:bg-slate-800/50"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRawTextModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePasteSubmit}
                disabled={isUploading || !rawText.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isUploading ? "Processing..." : "Import & Reconcile"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
