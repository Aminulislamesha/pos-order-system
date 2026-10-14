"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, CheckCircle2, Clock, ShieldAlert, KeyRound, History, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResetWeblogButton } from "./reset-weblog-button";

interface SettingsFormProps {
  initialSettings: Record<string, string>;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [inactivityDays, setInactivityDays] = React.useState(
    initialSettings.inactivity_days || "30"
  );
  const [repeatCustomerDays, setRepeatCustomerDays] = React.useState(
    initialSettings.repeat_customer_days || "30"
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/nn-weblog/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            inactivity_days: inactivityDays,
            repeat_customer_days: repeatCustomerDays,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update settings");
      }

      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span>Settings successfully persisted to the database.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          <ShieldAlert className="h-5 w-5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Customer Analytics Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span>Customer Retention & Inactivity Rules</span>
          </CardTitle>
          <CardDescription>
            Configure time windows for inactive follow-up triggers and repeat customer analytics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Pending Follow-up Inactivity Period (Days)
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={inactivityDays}
                  onChange={(e) => setInactivityDays(e.target.value)}
                  className="font-mono text-sm"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Customers with no order for longer than this period will appear in Pending Follow-ups.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Repeat Customer Period (Days)
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={repeatCustomerDays}
                  onChange={(e) => setRepeatCustomerDays(e.target.value)}
                  className="font-mono text-sm"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Customers placing multiple orders within this window will be flagged as Repeat Customers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Courier Packzy Credentials Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-500" />
            <span>Packzy / Steadfast Webhook Configuration</span>
          </CardTitle>
          <CardDescription>
            Environment parameters utilized for live verification and webhook ingress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs font-mono">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Webhook Ingress URL:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                https://pos-order-system.vercel.app/api/nn-weblog/webhook/steadfast
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Signature Header:</span>
              <span className="text-slate-800 dark:text-slate-200">
                X-Signature (HMAC-SHA256)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cache Enforced Interval:</span>
              <span className="text-slate-800 dark:text-slate-200">
                60 Seconds (Hard limit per invoice)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Card */}
      <Card className="border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <History className="h-4 w-4" />
              <span>Audit &amp; History Log</span>
            </span>
            <Link href="/nn-weblog/history">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:text-blue-300 cursor-pointer"
              >
                <span>View Full History</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardTitle>
          <CardDescription>
            Permanent timestamped records of every batch import and application data wipe with exact row counts.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Danger Zone: Application Reset */}
      <Card className="border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-4 w-4" />
            <span>Danger Zone: Clear Application Data</span>
          </CardTitle>
          <CardDescription>
            Permanently clear all NN Weblog orders, tracking history, and customers to start fresh anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-500 max-w-lg">
            This will wipe all orders, customers, and tracking audit records from the database. POS Inventory and POS products will remain completely untouched.
          </div>
          <ResetWeblogButton
            label="Reset Weblog Application"
            size="default"
            variant="destructive"
            className="bg-rose-600 text-white hover:bg-rose-700 border-none shrink-0"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Saving Changes..." : "Save Configuration"}</span>
        </Button>
      </div>
    </form>
  );
}
