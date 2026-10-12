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

  const inactivityDays = parseInt(settingsMap.inactivity_days || "30", 10);
  const repeatDays = parseInt(settingsMap.repeat_customer_days || "30", 10);

  try {
    const settingsRecords = await prisma.settings.findMany();
    for (const s of settingsRecords) {
      settingsMap[s.key] = s.value;
    }

    const inactivityThreshold = new Date();
    inactivityThreshold.setDate(inactivityThreshold.getDate() - inactivityDays);

    const repeatThreshold = new Date();
    repeatThreshold.setDate(repeatThreshold.getDate() - repeatDays);

    // Parallel database metrics aggregation
    const [
      ordersCount,
      deliveredCount,
      cancelledCount,
      pendingOrdersCount,
      revenueAgg,
      followUpsCount,
      repeatCount,
      ordersList,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: "delivered" } }),
      prisma.order.count({ where: { status: "cancelled" } }),
      prisma.order.count({ where: { status: "pending" } }),
      prisma.order.aggregate({ _sum: { total_bill: true } }),
      prisma.customer.count({
        where: {
          last_order_date: { lt: inactivityThreshold },
          is_followed_up: false,
        },
      }),
      prisma.customer.count({
        where: {
          total_orders: { gt: 1 },
          last_order_date: { gte: repeatThreshold },
        },
      }),
      prisma.order.findMany({
        take: 8,
        orderBy: { date: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    totalOrders = ordersCount;
    deliveredOrders = deliveredCount;
    cancelledOrders = cancelledCount;
    pendingCount = pendingOrdersCount;
    totalRevenue = revenueAgg._sum.total_bill || 0;
    pendingFollowUpsCount = followUpsCount;
    repeatCustomersCount = repeatCount;
    recentOrders = ordersList;
  } catch (err) {
    console.error("Dashboard database query error:", err);
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
                      className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors"
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
