import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Package,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ClockAlert,
  UserCheck,
  ArrowRight,
  PlusCircle,
  History,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/weblog/utils";
import { SyncLiveStatusButton } from "@/components/weblog/sync-live-status-button";
import { InlineRowStatusRefresher } from "@/components/weblog/inline-row-status-refresher";

export const dynamic = "force-dynamic";

import { ensureWeblogTables } from "@/lib/weblog/init-db";

export default async function DashboardPage() {
  await ensureWeblogTables();

  let settingsMap: Record<string, string> = {
    inactivity_days: "30",
    repeat_customer_days: "30",
  };
  let totalOrders = 0;
  let deliveredOrders = 0;
  let cancelledOrders = 0;
  let pendingCount = 0;
  let totalRevenue = 0;
  let pendingFollowUpsCount = 0;
  let repeatCustomersCount = 0;
  let recentOrders: any[] = [];
  let dbError: string | null = null;

  try {
    const settingsRecords = await prisma.settings.findMany().catch(() => []);
    for (const s of settingsRecords) {
      settingsMap[s.key] = s.value;
    }

    const inactivityDays = parseInt(settingsMap.inactivity_days || "30", 10);
    const repeatDays = parseInt(settingsMap.repeat_customer_days || "30", 10);

    const inactivityThreshold = new Date();
    inactivityThreshold.setDate(inactivityThreshold.getDate() - inactivityDays);

    const repeatThreshold = new Date();
    repeatThreshold.setDate(repeatThreshold.getDate() - repeatDays);

    // Fast unified aggregation queries (replaces 8 competing table scans with 2 lightweight SQL queries)
    const [orderStatsRes, customerStatsRes, recentOrdersRes] = await Promise.allSettled([
      prisma.$queryRaw<Array<{
        totalOrders: number;
        deliveredOrders: number;
        cancelledOrders: number;
        pendingCount: number;
        totalRevenue: number;
      }>>`
        SELECT 
          COUNT(*)::int AS "totalOrders",
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS "deliveredOrders",
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelledOrders",
          COUNT(*) FILTER (WHERE status = 'pending')::int AS "pendingCount",
          COALESCE(SUM(total_bill), 0)::float AS "totalRevenue"
        FROM "Order";
      `,
      prisma.$queryRaw<Array<{
        pendingFollowUpsCount: number;
        repeatCustomersCount: number;
      }>>`
        SELECT
          COUNT(*) FILTER (WHERE last_order_date < ${inactivityThreshold} AND is_followed_up = false)::int AS "pendingFollowUpsCount",
          COUNT(*) FILTER (WHERE total_orders > 1 AND last_order_date >= ${repeatThreshold})::int AS "repeatCustomersCount"
        FROM "Customer";
      `,
      prisma.order.findMany({
        take: 8,
        orderBy: { date: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    if (orderStatsRes.status === "fulfilled" && orderStatsRes.value[0]) {
      const row = orderStatsRes.value[0];
      totalOrders = Number(row.totalOrders || 0);
      deliveredOrders = Number(row.deliveredOrders || 0);
      cancelledOrders = Number(row.cancelledOrders || 0);
      pendingCount = Number(row.pendingCount || 0);
      totalRevenue = Number(row.totalRevenue || 0);
    } else if (orderStatsRes.status === "rejected") {
      const reason = String(orderStatsRes.reason?.message || orderStatsRes.reason || "");
      console.error("Order stats query rejected:", reason);
      if (reason.includes("planLimitReached")) {
        dbError = "Your Prisma Postgres database account has reached its plan limits (planLimitReached). Please upgrade your database plan on console.prisma.io or update your DATABASE_URL in Vercel to restore live order queries.";
      } else {
        dbError = reason || "Failed to query order statistics from database.";
      }
    }

    if (customerStatsRes.status === "fulfilled" && customerStatsRes.value[0]) {
      const row = customerStatsRes.value[0];
      pendingFollowUpsCount = Number(row.pendingFollowUpsCount || 0);
      repeatCustomersCount = Number(row.repeatCustomersCount || 0);
    } else if (customerStatsRes.status === "rejected") {
      console.error("Customer stats query rejected:", customerStatsRes.reason);
    }

    if (recentOrdersRes.status === "fulfilled") {
      recentOrders = recentOrdersRes.value;
    } else if (recentOrdersRes.status === "rejected") {
      console.error("Recent orders query rejected:", recentOrdersRes.reason);
    }

    // Fallback if count query had transient issue but orders exist
    if (totalOrders === 0 && recentOrders.length > 0) {
      totalOrders = recentOrders.length;
    }
  } catch (err: any) {
    console.error("Dashboard database query error:", err);
    dbError = err?.message || "Failed to communicate with database.";
  }

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-800 p-8 text-white shadow-xl shadow-blue-500/10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">
            Order Management & Steadfast Hub
          </h1>
          <p className="text-sm text-blue-100 max-w-xl">
            Live synchronization with Packzy Courier Webhook, automated customer retention tracking, and sub-millisecond database queries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncLiveStatusButton
            pendingCount={pendingCount}
            currentPageOrderIds={recentOrders.map((o) => o.id)}
            label="Sync Courier Status"
          />
          <Link href="/nn-weblog/import">
            <Button
              size="sm"
              className="bg-white text-blue-700 hover:bg-blue-50 font-semibold gap-1.5 shadow-sm cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Bulk Import</span>
            </Button>
          </Link>
          <Link href="/nn-weblog/history">
            <Button
              size="sm"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 gap-1.5 cursor-pointer"
            >
              <History className="h-4 w-4" />
              <span>History Log</span>
            </Button>
          </Link>
          <Link href="/nn-weblog/orders">
            <Button
              size="sm"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 gap-1.5 cursor-pointer"
            >
              <span>View All Orders</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Database Error Banner */}
      {dbError && (
        <Card className="border-rose-200 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/30">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400 shrink-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-base font-bold text-rose-900 dark:text-rose-200">
                Database Restriction: planLimitReached
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                {dbError}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href="https://console.prisma.io"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm transition-colors"
                >
                  <span>Open Prisma Console</span>
                  <ArrowRight className="h-3 w-3" />
                </a>
                <Link
                  href="/nn-weblog/history"
                  className="text-xs text-rose-800 dark:text-rose-300 font-medium hover:underline flex items-center gap-1"
                >
                  <History className="h-3.5 w-3.5" />
                  <span>View Audit &amp; History Log</span>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Total Orders
              </span>
              <Package className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {totalOrders.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-slate-400">Total in system</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Revenue
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Aggregated billed value</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Delivered
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">
              {deliveredOrders.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-slate-400">Completed shipments</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Cancelled / Return
              </span>
              <XCircle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-600">
              {cancelledOrders.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-slate-400">Failed / returned</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Follow-ups
              </span>
              <ClockAlert className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600">
              {pendingFollowUpsCount.toLocaleString()}
            </div>
            <Link
              href="/nn-weblog/follow-ups"
              className="mt-1 inline-flex items-center text-xs text-amber-600 hover:underline gap-0.5"
            >
              <span>Exceeds {inactivityDays}d</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Repeat Buyers
              </span>
              <UserCheck className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-600">
              {repeatCustomersCount.toLocaleString()}
            </div>
            <Link
              href="/nn-weblog/repeat-customers"
              className="mt-1 inline-flex items-center text-xs text-indigo-600 hover:underline gap-0.5"
            >
              <span>Within {repeatDays}d</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>
              Real-time feed with Steadfast dispatch status
            </CardDescription>
          </div>
          <Link href="/nn-weblog/orders">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No orders found.</p>
              <Link href="/nn-weblog/import">
                <Button size="sm" className="mt-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Import First Batch</span>
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Invoice ID</th>
                    <th className="px-6 py-3 font-semibold">Date</th>
                    <th className="px-6 py-3 font-semibold">Customer</th>
                    <th className="px-6 py-3 font-semibold">Address</th>
                    <th className="px-6 py-3 font-semibold">Total</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {recentOrders.map((o) => (
                    <tr
                      key={o.id}
                      className="hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
                    >
                      <td className="px-6 py-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {o.invoice_id}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {formatDate(o.date)}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/nn-weblog/customers/${o.customer.id}`}
                          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {o.customer.name}
                        </Link>
                        <div className="font-mono text-xs text-slate-400">
                          {o.customer.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {o.address}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(o.total_bill)}
                      </td>
                      <td className="px-6 py-4">
                        <InlineRowStatusRefresher
                          orderId={o.id}
                          invoiceId={o.invoice_id}
                          initialStatus={o.status}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/nn-weblog/orders/${o.id}`}>
                          <Button variant="outline" size="sm" className="h-8 text-xs">
                            Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
