import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  CreditCard,
  Truck,
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/weblog/utils";
import { OrderStatusRefresher } from "@/components/weblog/order-status-refresher";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

import { ensureWeblogTables } from "@/lib/weblog/init-db";

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  await ensureWeblogTables();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      tracking_history: {
        orderBy: { timestamp: "desc" },
      },
    },
  });

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link href="/nn-weblog/orders">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Orders</span>
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          <Badge status={order.status} className="px-3 py-1 text-sm font-semibold">
            {order.status}
          </Badge>
        </div>
      </div>

      {/* Main Order Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100">
              {order.invoice_id}
            </h1>
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="h-3.5 w-3.5" />
            <span>Order Date: {formatDate(order.date)}</span>
            <span>•</span>
            <span>Recorded in System: {formatDateTime(order.createdAt)}</span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <OrderStatusRefresher
            orderId={order.id}
            invoiceId={order.invoice_id}
            lastCheckedAt={
              order.last_status_checked_at
                ? order.last_status_checked_at.toISOString()
                : null
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Financials & Details */}
        <div className="space-y-6 lg:col-span-2">
          {/* Financial Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-blue-500" />
                <span>Financial Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <span className="text-xs text-slate-500">Total Bill</span>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {formatCurrency(order.total_bill)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <span className="text-xs text-slate-500">Delivery Charge</span>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {formatCurrency(order.delivery_charge)}
                  </div>
                </div>
                <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-950/40">
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                    Net Receivable
                  </span>
                  <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                    {formatCurrency(order.total_bill + order.delivery_charge)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Destination & Order Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-emerald-500" />
                <span>Shipping Address & Notes</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Delivery Address
                </span>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                  {order.address || "No address entered"}
                </p>
              </div>

              {order.details && (
                <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Order Details / Notes
                  </span>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {order.details}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tracking History Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-purple-500" />
                <span>Steadfast Tracking Audit Log</span>
              </CardTitle>
              <CardDescription>
                Complete immutable record of courier webhook and status updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {order.tracking_history.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">
                  No status transition events recorded yet.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 pl-4 space-y-6 dark:border-slate-800 ml-2">
                  {order.tracking_history.map((th) => (
                    <div key={th.id} className="relative group">
                      <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600 dark:border-slate-900" />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge status={th.new_status} className="text-xs">
                            {th.new_status}
                          </Badge>
                          {th.previous_status && (
                            <span className="text-xs text-slate-400">
                              (from {th.previous_status})
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          {formatDateTime(th.timestamp)}
                        </span>
                      </div>
                      {th.message && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          {th.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Customer & Courier Metadata */}
        <div className="space-y-6">
          {/* Customer Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-blue-500" />
                <span>Customer Profile</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-xs text-slate-400">Name</span>
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {order.customer.name}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400">Phone</span>
                <div className="font-mono text-sm text-slate-700 dark:text-slate-300">
                  {order.customer.phone}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-xs text-slate-500">Lifetime Orders</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {order.customer.total_orders}
                </span>
              </div>
              <Link href={`/nn-weblog/customers/${order.customer.id}`} className="block pt-2">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  View Full Customer Profile
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Courier Packzy Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4 text-emerald-500" />
                <span>Packzy (Steadfast) Dispatch</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Courier Status</span>
                <Badge status={order.status}>{order.status}</Badge>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-xs text-slate-400">Tracking Code</span>
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                  {order.tracking_code || "Not generated yet"}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-xs text-slate-400">Consignment ID</span>
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                  {order.consignment_id || "None"}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-xs text-slate-400">Last Checked</span>
                <span className="text-xs text-slate-500">
                  {formatDateTime(order.last_status_checked_at)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
