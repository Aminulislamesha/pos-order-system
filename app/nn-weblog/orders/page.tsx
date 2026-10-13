import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Package,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/weblog/utils";
import { ResetWeblogButton } from "@/components/weblog/reset-weblog-button";
import { SyncLiveStatusButton } from "@/components/weblog/sync-live-status-button";
import { InlineRowStatusRefresher } from "@/components/weblog/inline-row-status-refresher";

export const dynamic = "force-dynamic";

interface OrdersPageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
  }>;
}

import { ensureWeblogTables } from "@/lib/weblog/init-db";

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await ensureWeblogTables();
  const params = await searchParams;
  const statusFilter = params.status || "";
  const query = params.q || "";
  const page = parseInt(params.page || "1", 10);
  const pageSize = 25;

  const whereClause: Record<string, unknown> = {};

  if (statusFilter === "needs_review") {
    whereClause.requires_manual_review = true;
  } else if (statusFilter === "cancelled_with_charge") {
    whereClause.status = "cancelled";
    whereClause.cancellation_type = "with_delivery_charge";
  } else if (statusFilter === "cancelled_without_charge") {
    whereClause.status = "cancelled";
    whereClause.cancellation_type = "without_delivery_charge";
  } else if (statusFilter && statusFilter !== "all") {
    whereClause.status = statusFilter;
  }

  if (query) {
    whereClause.OR = [
      { invoice_id: { contains: query, mode: "insensitive" } },
      { customer: { phone: { contains: query } } },
      { customer: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  let totalCount = 0;
  let pendingCount = 0;
  let reviewCount = 0;
  let orders: any[] = [];

  try {
    const [count, pendingTotal, reviewTotal, list] = await Promise.all([
      prisma.order.count({ where: whereClause }),
      prisma.order.count({ where: { status: "pending" } }),
      prisma.order.count({ where: { requires_manual_review: true } }),
      prisma.order.findMany({
        where: whereClause,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { date: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);
    totalCount = count;
    pendingCount = pendingTotal;
    reviewCount = reviewTotal;
    orders = list;
  } catch (err) {
    console.error("Orders query error:", err);
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const STATUSES = [
    { label: "All Orders", value: "" },
    { label: `Needs Review (${reviewCount})`, value: "needs_review", highlight: reviewCount > 0 },
    { label: "Pending", value: "pending" },
    { label: "Delivered", value: "delivered" },
    { label: "Partial Delivered", value: "partial_delivered" },
    { label: "In Transit", value: "in_transit" },
    { label: "Cancelled (All)", value: "cancelled" },
    { label: "Cancelled (With Chg)", value: "cancelled_with_charge" },
    { label: "Cancelled (No Chg)", value: "cancelled_without_charge" },
    { label: "Hold", value: "hold" },
  ];

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Orders
          </h1>
          <p className="text-sm text-slate-500">
            {totalCount.toLocaleString()} orders indexed in the database
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SyncLiveStatusButton
            pendingCount={pendingCount}
            currentPageOrderIds={orders.map((o) => o.id)}
          />
          <ResetWeblogButton label="Clear All Orders" />
          <Link href="/nn-weblog/import">
            <Button size="sm" className="gap-1.5 shadow-sm bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">
              <span>Bulk Import</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUSES.map((st) => {
              const isActive = (statusFilter || "") === st.value;
              return (
                <Link
                  key={st.value}
                  href={`/nn-weblog/orders?status=${st.value}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {st.label}
                </Link>
              );
            })}
          </div>

          <form method="GET" className="relative w-full max-w-xs">
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search invoice or phone..."
              className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </form>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No matching orders found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Invoice ID</th>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-3 py-3 font-semibold">Total Bill</th>
                    <th className="px-3 py-3 font-semibold">COD</th>
                    <th className="px-3 py-3 font-semibold">Deliv Chg</th>
                    <th className="px-3 py-3 font-semibold">Net Rec</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {orders.map((o) => {
                    const netRec =
                      o.net_receivable !== null && o.net_receivable !== undefined
                        ? o.net_receivable
                        : Math.max(0, (o.cod_amount || o.total_bill) - o.delivery_charge);

                    return (
                      <tr
                        key={o.id}
                        className="hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
                      >
                        <td className="px-5 py-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                          <div>{o.invoice_id}</div>
                          {o.requires_manual_review && (
                            <Link href="/nn-weblog/review">
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-200 mt-1 cursor-pointer">
                                Review Needed
                              </span>
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-4 text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(o.date)}
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/nn-weblog/customers/${o.customer.id}`}
                            className="font-medium text-blue-600 hover:underline dark:text-blue-400 block"
                          >
                            {o.customer.name}
                          </Link>
                          <div className="font-mono text-xs text-slate-400">
                            {o.customer.phone}
                          </div>
                        </td>
                        <td className="px-3 py-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {formatCurrency(o.total_bill)}
                        </td>
                        <td className="px-3 py-4 text-xs font-mono whitespace-nowrap">
                          {o.cod_amount > 0 ? (
                            formatCurrency(o.cod_amount)
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-xs text-slate-500 whitespace-nowrap">
                          {formatCurrency(o.delivery_charge)}
                        </td>
                        <td className="px-3 py-4 text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {formatCurrency(netRec)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <InlineRowStatusRefresher
                              orderId={o.id}
                              invoiceId={o.invoice_id}
                              initialStatus={o.status}
                            />
                            {o.status === "cancelled" && o.cancellation_type && (
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                                {o.cancellation_type === "with_delivery_charge"
                                  ? "With deliv chg"
                                  : "Without deliv chg"}
                              </span>
                            )}
                            {o.cancel_reason && (
                              <span
                                className="text-[10px] text-slate-500 dark:text-slate-400 italic truncate max-w-[140px] cursor-help"
                                title={`Steadfast Note: ${o.cancel_reason}`}
                              >
                                Note: {o.cancel_reason}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <Link href={`/nn-weblog/orders/${o.id}`}>
                            <Button variant="outline" size="sm" className="h-8 text-xs">
                              View Details
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 && (
                  <Link
                    href={`/nn-weblog/orders?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  >
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      Previous
                    </Button>
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/nn-weblog/orders?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
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
