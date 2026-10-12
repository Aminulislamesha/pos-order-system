"use client";

import * as React from "react";
import {
  Webhook,
  Send,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function WebhookTesterClient() {
  const [invoice, setInvoice] = React.useState("INV-1001");
  const [status, setStatus] = React.useState("delivered");
  const [message, setMessage] = React.useState("Parcel safely delivered to recipient");
  const [corruptSignature, setCorruptSignature] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [responseLog, setResponseLog] = React.useState<{
    status: number;
    data: unknown;
    signatureUsed: string;
  } | null>(null);

  const [copied, setCopied] = React.useState(false);

  const payloadObject = React.useMemo(
    () => ({
      invoice: invoice,
      status: status,
      tracking_code: `ST-${invoice}`,
      consignment_id: 11543970,
      message: message,
      timestamp: "2026-10-12T12:00:00.000Z",
    }),
    [invoice, status, message]
  );

  const payloadString = JSON.stringify(payloadObject, null, 2);

  const handleSendWebhook = async () => {
    setLoading(true);
    setResponseLog(null);

    try {
      const res = await fetch("/api/nn-weblog/webhook/steadfast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": corruptSignature
            ? "invalid_tampered_hmac_signature_hex"
            : "test_webhook_secret_key",
        },
        body: payloadString,
      });

      let jsonRes: unknown = null;
      try {
        jsonRes = await res.json();
      } catch {
        jsonRes = { error: "Non-JSON response" };
      }

      setResponseLog({
        status: res.status,
        data: jsonRes,
        signatureUsed: corruptSignature ? "INVALID (Tampered)" : "Valid HMAC Header",
      });
    } catch (err: unknown) {
      setResponseLog({
        status: 500,
        data: { error: err instanceof Error ? err.message : "Failed to trigger" },
        signatureUsed: "N/A",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(payloadString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-4 w-4 text-blue-500" />
            <span>Simulate Steadfast / Packzy Webhook Ingress</span>
          </CardTitle>
          <CardDescription>
            Test live HMAC-SHA256 signature verification, status mapping, and tracking history insertion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                Target Invoice ID
              </label>
              <input
                type="text"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder="INV-1001"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                Packzy Courier Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="delivered">delivered</option>
                <option value="partial_delivered">partial_delivered</option>
                <option value="in_transit">in_transit</option>
                <option value="cancelled">cancelled</option>
                <option value="hold">hold</option>
                <option value="pending">pending</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                Audit Log Message
              </label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={corruptSignature}
                onChange={(e) => setCorruptSignature(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="text-slate-600 dark:text-slate-400">
                Corrupt X-Signature (Test Security Rejection / 401 Unauthorized)
              </span>
            </label>
          </div>

          {/* Raw Payload Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Payload (JSON)
              </span>
              <button
                type="button"
                onClick={handleCopyPayload}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <pre className="rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs text-emerald-400 overflow-x-auto dark:border-slate-800">
              {payloadString}
            </pre>
          </div>

          <Button
            onClick={handleSendWebhook}
            disabled={loading}
            className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium shadow-md shadow-blue-500/20"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Send Webhook to /api/nn-weblog/webhook/steadfast</span>
          </Button>

          {/* Response Inspector */}
          {responseLog && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">
                  HTTP Response:
                </span>
                <span
                  className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                    responseLog.status >= 200 && responseLog.status < 300
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                  }`}
                >
                  Status {responseLog.status}
                </span>
              </div>
              <pre className="rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200 overflow-x-auto">
                {JSON.stringify(responseLog.data, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
