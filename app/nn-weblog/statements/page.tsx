import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Coins,
  Truck,
  ArrowRight,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/weblog/utils";
import { StatementUploader } from "@/components/weblog/statement-uploader";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Steadfast Statements | NN Weblog",
  description: "Automated payment statement reconciliation for COD, delivery charges, and settlements",
};

interface StatementsPageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
  }>;
}

export default async function StatementsPage({ searchParams }: StatementsPageProps) {
  await ensureWeblogTables();
  const params = await searchParams;
  const statusFilter = params.status || "";
  const query = params.q || "";
  const page = parseInt(params.page || "1", 10);
  const pageSize = 30;

  const whereClause: Record<string, unknown> = {};

  if (statusFilter === "matched") {
    whereClause.is_matched = true;
  } else if (statusFilter === "pending") {
    whereClause.is_matched = false;
  }

  if (query) {
    whereClause.OR = [
      { invoice: { contains: query, mode: "insensitive" } },
      { order_id: { contains: query, mode: "insensitive" } },
      { tracking_code: { contains: query, mode: "insensitive" } },
      { recipient_phone: { contains: query } },
      { recipient_name: { contains: query, mode: "insensitive" } },
    ];
  }

  let totalCount = 0;
  let matchedCount = 0;
  let pendingCount = 0;
  let totalCod = 0;
  let totalShipping = 0;
  let statements: any[] = [];

  try {
    const [count, matchedTotal, pendingTotal, agg, list] = await Promise.all([
      prisma.steadfastStatement.count({ where: whereClause }),
      prisma.steadfastStatement.count({ where: { is_matched: true } }),
      prisma.steadfastStatement.count({ where: { is_matched: false } }),
      prisma.steadfastStatement.aggregate({
        _sum: { cod_amount: true, shipping_charge: true },
      }),
      prisma.steadfastStatement.findMany({
        where: whereClause,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { uploaded_at: "desc" },
      }),
    ]);

    totalCount = count;
    matchedCount = matchedTotal;
    pendingCount = pendingTotal;
    totalCod = agg._sum.cod_amount || 0;
    totalShipping = agg._sum.shipping_charge || 0;
    statements = list;
  } catch (err) {
    console.error("Statements query error:", err);
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
            <span>Steadfast Payment Statements</span>
          </h1>
          <p className="text-sm text-slate-500">
            Reconcile exact COD, delivery charges, and courier settlements against your orders
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/nn-weblog/orders">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <span>View Orders</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Statement Rows
              </p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {(matchedCount + pendingCount).toLocaleString()}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Reconciled with Orders
              </p>
              <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                {matchedCount.toLocaleString()}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Waiting for Future Orders
              </p>
              <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                {pendingCount.toLocaleString()}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                Settled Net Receivable
              </p>
              <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                {formatCurrency(totalCod - totalShipping)}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/60 dark:text-blue-300">
              <Coins className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Uploader Box */}
      <StatementUploader />

      {/* Filter Tabs & Search */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/nn-weblog/statements${query ? `?q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === ""
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              All Records ({matchedCount + pendingCount})
            </Link>
            <Link
              href={`/nn-weblog/statements?status=matched${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === "matched"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Reconciled ({matchedCount})
            </Link>
            <Link
              href={`/nn-weblog/statements?status=pending${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === "pending"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Waiting for Orders ({pendingCount})
            </Link>
          </div>

          <form method="GET" action="/nn-weblog/statements" className="flex items-center gap-2">
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search invoice, CID, phone..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            {query && (
              <Link href={`/nn-weblog/statements${statusFilter ? `?status=${statusFilter}` : ""}`}>
                <Button variant="ghost" size="sm" className="h-8 text-xs">
                  Clear
                </Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Statement Table */}
      <Card>
        <CardContent className="p-0">
          {statements.length === 0 ? (
            <div className="py-16 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
              <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                No statement records found
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Upload your Steadfast Excel / CSV statement file above to match your orders and populate exact COD and courier fees.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Order / CID</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Recipient</th>
                    <th className="px-3 py-3 font-semibold">COD Amount</th>
                    <th className="px-3 py-3 font-semibold">Shipping</th>
                    <th className="px-3 py-3 font-semibold">Net</th>
                    <th className="px-4 py-3 font-semibold">Delivery Status</th>
                    <th className="px-4 py-3 font-semibold">Reconciliation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {statements.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors text-xs"
                    >
                      <td className="px-5 py-3.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {s.order_id}
                        {s.tracking_code && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {s.tracking_code}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {s.invoice}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {s.recipient_name || "—"}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {s.recipient_phone || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(s.cod_amount)}
                      </td>
                      <td className="px-3 py-3.5 font-mono text-slate-500">
                        {formatCurrency(s.shipping_charge)}
                      </td>
                      <td className="px-3 py-3.5 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(s.cod_amount - s.shipping_charge)}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className={
                            (s.delivery_status || "").toLowerCase().includes("delivered")
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]"
                              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 text-[10px]"
                          }
                        >
                          {s.delivery_status || "Delivered"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        {s.is_matched ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            <Clock className="h-3 w-3" />
                            Waiting for Order
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800 text-xs">
              <span className="text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 && (
                  <Link
                    href={`/nn-weblog/statements?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  >
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      Previous
                    </Button>
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/nn-weblog/statements?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  >
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      Next
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
