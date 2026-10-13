"use client";

import React, { useState, useEffect } from "react";
import {
  Banknote,
  Plus,
  Trash2,
  Calendar,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/weblog/utils";

interface CostRecord {
  id: string;
  base_product_name: string;
  cost: number;
  effective_from: string | null;
  effective_to: string | null;
  notes: string | null;
}

export function ProductCostSettings() {
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [availableBases, setAvailableBases] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [productName, setProductName] = useState("");
  const [customProductName, setCustomProductName] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchCosts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/nn-weblog/settings/product-costs");
      if (res.ok) {
        const data = await res.json();
        setCosts(data.costs || []);
        setAvailableBases(data.availableBases || []);
        if (data.availableBases && data.availableBases.length > 0) {
          setProductName(data.availableBases[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load product costs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCosts();
  }, []);

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const targetProduct =
      productName === "__custom__" ? customProductName.trim() : productName.trim();

    if (!targetProduct) {
      setErrorMsg("Please select or enter a product name.");
      return;
    }

    const numCost = parseFloat(costAmount);
    if (isNaN(numCost) || numCost <= 0) {
      setErrorMsg("Please enter a valid making cost amount greater than 0.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/nn-weblog/settings/product-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_product_name: targetProduct,
          cost: numCost,
          effective_from: effectiveFrom || null,
          effective_to: effectiveTo || null,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save product cost");
      }

      setCostAmount("");
      setEffectiveFrom("");
      setEffectiveTo("");
      setNotes("");
      setShowAddForm(false);
      await fetchCosts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving cost");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this cost configuration?")) return;
    try {
      const res = await fetch(`/api/nn-weblog/settings/product-costs?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCosts(costs.filter((c) => c.id !== id));
      }
    } catch (err) {
      alert("Failed to delete cost configuration");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-5 w-5 text-emerald-600" />
              <span>1pc Product Making Cost &amp; Time-based Margins</span>
            </CardTitle>
            <CardDescription>
              Set the 1pc making cost per base product for all time or within effective date ranges.
              Statistics use these costs to compute Cost of Goods Sold (COGS) and true Net Margin.
            </CardDescription>
          </div>

          {!showAddForm && (
            <Button
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Making Cost</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddCost}
            className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                New 1pc Making Cost Rule
              </h4>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Product selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Base Product
                </label>
                <select
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {availableBases.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  <option value="__custom__">+ Enter Custom Product Name...</option>
                </select>

                {productName === "__custom__" && (
                  <input
                    type="text"
                    value={customProductName}
                    onChange={(e) => setCustomProductName(e.target.value)}
                    placeholder="e.g. Snuggly Palazzo"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                )}
              </div>

              {/* 1pc Cost */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  1pc Making Cost (BDT)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  placeholder="e.g. 150"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Effective From */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Effective From (Optional)
                </label>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Effective To */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Effective To (Optional)
                </label>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Batch / Production Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Fabric price increase, Winter production batch..."
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Save Cost Rule</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Existing Costs List */}
        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" />
            Loading cost rules...
          </div>
        ) : costs.length === 0 ? (
          <div className="py-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            No product making costs defined yet. Click &quot;Add Making Cost&quot; to configure unit costs.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Base Product</th>
                  <th className="px-4 py-2.5 font-semibold">1pc Making Cost</th>
                  <th className="px-4 py-2.5 font-semibold">Effective Validity Window</th>
                  <th className="px-4 py-2.5 font-semibold">Notes</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {costs.map((c) => {
                  let windowLabel = "All time";
                  if (c.effective_from && c.effective_to) {
                    windowLabel = `${formatDate(c.effective_from)} → ${formatDate(c.effective_to)}`;
                  } else if (c.effective_from) {
                    windowLabel = `From ${formatDate(c.effective_from)} onward`;
                  } else if (c.effective_to) {
                    windowLabel = `Until ${formatDate(c.effective_to)}`;
                  }

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {c.base_product_name}
                      </td>
                      <td className="px-4 py-3 font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(c.cost)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          {windowLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                        {c.notes || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(c.id)}
                          className="h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
