import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ArrowLeft,
  Phone,
  Calendar,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/weblog/utils";
import { FollowUpButton } from "@/components/weblog/follow-up-button";

export const dynamic = "force-dynamic";

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { date: "desc" },
      },
    },
  });

  if (!customer) {
    notFound();
  }

  // Calculate aggregations
  const totalOrders = customer.orders.length;
  const deliveredOrders = customer.orders.filter(
    (o) => o.status === "delivered" || o.status === "partial_delivered"
  ).length;
  const returnedOrCancelledOrders = customer.orders.filter(
    (o) => o.status === "cancelled" || o.status === "hold"
  ).length;
  const pendingOrders = totalOrders - deliveredOrders - returnedOrCancelledOrders;

  const lifetimeSpend = customer.orders.reduce((sum, o) => sum + o.total_bill, 0);

  // Delivery success rate
  const deliveryRate =
    totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;

  // Days since last order
  let daysSinceLastOrder = 0;
  if (customer.last_order_date) {
    const diffTime = Math.abs(Date.now() - new Date(customer.last_order_date).getTime());
    daysSinceLastOrder = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Link href="/nn-weblog/customers">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Customers</span>
          </Button>
        </Link>

        <FollowUpButton customerId={customer.id} isFollowedUp={customer.is_followed_up} />
      </div>

      {/* Customer Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold text-xl">
            {customer.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {customer.name}
            </h1>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-mono font-medium text-slate-700 dark:text-slate-300">
                <Phone className="h-3.5 w-3.5" />
                {customer.phone}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Last Order: {formatDate(customer.last_order_date)} ({daysSinceLastOrder} days ago)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalOrders > 1 ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              Repeat Customer ({totalOrders} orders)
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Single Order Buyer
            </span>
          )}
        </div>
      </div>

      {/* Aggregated KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Lifetime Value
              </span>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatCurrency(lifetimeSpend)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Total order bill amount</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Delivered Orders
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">
              {deliveredOrders}
            </div>
            <p className="mt-1 text-xs text-slate-400">{deliveryRate}% delivery success rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Returned / Cancelled
              </span>
              <XCircle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-600">
              {returnedOrCancelledOrders}
            </div>
            <p className="mt-1 text-xs text-slate-400">Shipment returns or cancel</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Pending / In Transit
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600">
              {pendingOrders}
            </div>
            <p className="mt-1 text-xs text-slate-400">Awaiting dispatch completion</p>
          </CardContent>
        </Card>
      </div>

      {/* Order History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-500" />
            <span>Customer Order History ({customer.orders.length})</span>
          </CardTitle>
          <CardDescription>
            Chronological log of all orders placed by this customer
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {customer.orders.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No orders found for this customer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Invoice ID</th>
                    <th className="px-6 py-3 font-semibold">Date</th>
                    <th className="px-6 py-3 font-semibold">Address</th>
                    <th className="px-6 py-3 font-semibold">Total Bill</th>
                    <th className="px-6 py-3 font-semibold">Delivery Charge</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {customer.orders.map((o) => (
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
                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {o.address}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(o.total_bill)}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {formatCurrency(o.delivery_charge)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge status={o.status}>{o.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/nn-weblog/orders/${o.id}`}>
                          <Button variant="outline" size="sm" className="h-8 text-xs">
                            View Order
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
