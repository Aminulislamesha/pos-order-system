import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  BarChart3,
  TrendingUp,
  PackageCheck,
  RotateCcw,
  Banknote,
  DollarSign,
  UserCheck,
  CheckCircle2,
  Calendar,
  Filter,
  Truck,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/weblog/utils";
import { calculateWeblogStats } from "@/lib/weblog/stats-calculator";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Product & Sales Statistics | NN Weblog",
  description: "Comprehensive product matrix, color/size breakdowns, margins, and outreach conversions",
};

interface StatsPageProps {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    product?: string;
  }>;
}

export default async function StatisticsPage({ searchParams }: StatsPageProps) {
  await ensureWeblogTables();
  const params = await searchParams;
  const preset = params.preset || "all";
  const customFrom = params.from || "";
  const customTo = params.to || "";
  const selectedProduct = params.product || "";

  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  const now = new Date();
  if (preset === "today") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (preset === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    fromDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
    toDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
  } else if (preset === "7days") {
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
  } else if (preset === "month") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  } else if (preset === "custom") {
    if (customFrom) fromDate = new Date(`${customFrom}T00:00:00.000Z`);
    if (customTo) toDate = new Date(`${customTo}T23:59:59.999Z`);
  }

  const [stats, baseProducts] = await Promise.all([
    calculateWeblogStats({
      fromDate,
      toDate,
      selectedBaseProduct: selectedProduct || null,
    }),
    prisma.baseProduct.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const deliverySuccessRate =
    stats.totalOrders > 0
      ? Math.round((stats.deliveredCount / stats.totalOrders) * 100)
      : 0;

  const cancellationRate =
    stats.totalOrders > 0
      ? Math.round((stats.cancelledTotalCount / stats.totalOrders) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              <span>Product &amp; Sales Statistics</span>
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time breakdown of sold products, color/size inventory demand, net margins, and follow-up conversions.
          </p>
        </div>

        <Link href="/nn-weblog/settings">
          <Button variant="outline" size="sm" className="text-xs gap-1.5 self-start md:self-auto">
            <Banknote className="h-3.5 w-3.5 text-emerald-600" />
            <span>Configure Making Costs</span>
          </Button>
        </Link>
      </div>

      {/* Filter Bar (Date Presets & Product Filter) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-400 uppercase mr-1">
                Period:
              </span>
              {[
                { label: "All Time", value: "all" },
                { label: "Today", value: "today" },
                { label: "Yesterday", value: "yesterday" },
                { label: "Last 7 Days", value: "7days" },
                { label: "This Month", value: "month" },
              ].map((p) => (
                <Link
                  key={p.value}
                  href={`/nn-weblog/stats?preset=${p.value}${selectedProduct ? `&product=${encodeURIComponent(selectedProduct)}` : ""}`}
                >
                  <Button
                    variant={preset === p.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-3 text-xs"
                  >
                    {p.label}
                  </Button>
                </Link>
              ))}
            </div>

            {/* Base Product Selector */}
            <form method="GET" className="flex items-center gap-2">
              <input type="hidden" name="preset" value={preset} />
              {customFrom && <input type="hidden" name="from" value={customFrom} />}
              {customTo && <input type="hidden" name="to" value={customTo} />}
              <span className="text-xs font-semibold text-slate-400 uppercase">
                Product:
              </span>
              <select
                name="product"
                defaultValue={selectedProduct}
                onChange={(e) => {
                  const form = e.target.closest("form");
                  if (form) form.submit();
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All Products</option>
                {baseProducts.map((bp) => (
                  <option key={bp.name} value={bp.name}>
                    {bp.name}
                  </option>
                ))}
              </select>
            </form>
          </div>

          {/* Custom Date Range Picker */}
          <form
            method="GET"
            className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs"
          >
            <input type="hidden" name="preset" value="custom" />
            {selectedProduct && <input type="hidden" name="product" value={selectedProduct} />}
            <span className="font-medium text-slate-500">Custom Date Range:</span>
            <input
              type="date"
              name="from"
              defaultValue={customFrom}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              name="to"
              defaultValue={customTo}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs">
              Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* High-Level KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Orders & Repeat Rate */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Total Orders
              </span>
              <PackageCheck className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.totalOrders}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                {stats.repeatOrders} Repeat ({stats.repeatRate}%)
              </span>
              <span className="text-slate-400">• {stats.newOrders} New</span>
            </div>
          </CardContent>
        </Card>

        {/* Outreach Conversion (From Marked as Followed-Up) */}
        <Card className="border-amber-200 bg-amber-50/20 dark:border-amber-900/60 dark:bg-amber-950/10">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase">
                Follow-up Outreach Conversion
              </span>
              <UserCheck className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-800 dark:text-amber-200">
              {stats.followedUpOrdersCount}{" "}
              <span className="text-sm font-normal text-amber-600">orders</span>
            </div>
            <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80 font-medium">
              Revenue: {formatCurrency(stats.followedUpRevenue)}
            </p>
          </CardContent>
        </Card>

        {/* Net Receivable (Steadfast COD - Delivery Charge) */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Net Receivable
              </span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(stats.netReceivable)}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              COD ({formatCurrency(stats.totalCod)}) - Deliv ({formatCurrency(stats.totalDeliveryCharge)})
            </p>
          </CardContent>
        </Card>

        {/* Net Margin (Net Receivable - Making Costs) */}
        <Card className="border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">
                Net Profit Margin
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(stats.netMargin)}
            </div>
            <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/80">
              COGS Making Cost: {formatCurrency(stats.totalCogs)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPI Row: Status Breakdown & Volumes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Delivered Orders */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500">Delivered</span>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.deliveredCount}
              </div>
              <span className="text-[11px] text-emerald-600 font-medium">
                {deliverySuccessRate}% success rate
              </span>
            </div>
            <CheckCircle2 className="h-7 w-7 text-emerald-500/30" />
          </CardContent>
        </Card>

        {/* Partially Delivered */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500">Partial Delivered</span>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.partialDeliveredCount}
              </div>
              <span className="text-[11px] text-amber-600 font-medium">
                Partial returns tracked
              </span>
            </div>
            <RotateCcw className="h-7 w-7 text-amber-500/30" />
          </CardContent>
        </Card>

        {/* Cancelled Total & Subtypes */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Cancelled</span>
              <span className="text-xs font-semibold text-rose-600">
                {cancellationRate}%
              </span>
            </div>
            <div className="text-xl font-bold text-rose-600 mt-0.5">
              {stats.cancelledTotalCount}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
              <span>With chg: {stats.cancelledWithChargeCount}</span>
              <span>•</span>
              <span>No chg: {stats.cancelledWithoutChargeCount}</span>
            </div>
          </CardContent>
        </Card>

        {/* Units Sold vs Returned */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Garment Units Matrix</span>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {stats.totalSoldUnits}{" "}
              <span className="text-xs font-normal text-slate-400">pcs sold</span>
            </div>
            <span className="text-[11px] text-rose-500 font-medium">
              {stats.totalReturnedUnits} pcs returned / cancelled
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Product / Color / Size Matrix Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-blue-500" />
            <span>Product, Color &amp; Size Breakdown Matrix</span>
          </CardTitle>
          <CardDescription>
            Categorized using the POS Inventory Alias Engine. Shows demand, returns, and time-based COGS per SKU.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {stats.productStats.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No product items found for the selected filter period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Base Product</th>
                    <th className="px-4 py-3 font-semibold">Color</th>
                    <th className="px-3 py-3 font-semibold">Size</th>
                    <th className="px-4 py-3 font-semibold text-right">Units Sold</th>
                    <th className="px-4 py-3 font-semibold text-right">Units Returned</th>
                    <th className="px-4 py-3 font-semibold text-right">Unit Making Cost</th>
                    <th className="px-5 py-3 font-semibold text-right">Total COGS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {stats.productStats.map((item, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {item.baseProduct}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">
                          {item.color}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {item.size}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {item.soldUnits}
                      </td>
                      <td className="px-4 py-3 text-right text-rose-500 font-mono">
                        {item.returnedUnits > 0 ? item.returnedUnits : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 font-mono">
                        {item.unitCost > 0 ? formatCurrency(item.unitCost) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900 dark:text-slate-100 font-mono">
                        {item.totalCost > 0 ? formatCurrency(item.totalCost) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100/70 font-semibold text-slate-900 dark:bg-slate-800/70 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700">
                  <tr>
                    <td className="px-5 py-3" colSpan={3}>
                      Total Summary ({stats.productStats.length} variations)
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {stats.totalSoldUnits}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-500">
                      {stats.totalReturnedUnits}
                    </td>
                    <td className="px-4 py-3 text-right">—</td>
                    <td className="px-5 py-3 text-right font-mono font-bold">
                      {formatCurrency(stats.totalCogs)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancellation Reasons Breakdown (From Firebase Steadfast Notes) */}
      {stats.cancelReasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <span>Steadfast Cancellation Reasons Breakdown</span>
            </CardTitle>
            <CardDescription>
              Reasons captured from Steadfast courier notes (Firebase Firestore) on canceled shipments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.cancelReasons.map((cr, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl border border-rose-100 bg-rose-50/50 dark:border-rose-950 dark:bg-rose-950/20 text-xs"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200 pr-2">
                    {cr.reason}
                  </span>
                  <span className="rounded-full bg-rose-200/80 px-2 py-0.5 font-bold font-mono text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 shrink-0">
                    {cr.count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
