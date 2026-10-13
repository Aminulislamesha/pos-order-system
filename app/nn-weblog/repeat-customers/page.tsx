import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { UserCheck, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/weblog/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Repeat Customers | NN Weblog",
  description: "High-value returning customers placing multiple orders within configured timeframe",
};

import { ensureWeblogTables } from "@/lib/weblog/init-db";

export default async function RepeatCustomersPage() {
  await ensureWeblogTables();
  let repeatDays = 30;
  let customers: any[] = [];

  try {
    const repeatSetting = await prisma.settings.findUnique({
      where: { key: "repeat_customer_days" },
    });
    repeatDays = parseInt(repeatSetting?.value || "30", 10);

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - repeatDays);

    customers = await prisma.customer.findMany({
      where: {
        total_orders: { gt: 1 },
        last_order_date: { gte: thresholdDate },
      },
      orderBy: {
        total_orders: "desc",
      },
      include: {
        orders: {
          take: 3,
          orderBy: { date: "desc" },
          select: {
            id: true,
            invoice_id: true,
            date: true,
            total_bill: true,
            status: true,
          },
        },
      },
    });
  } catch (err) {
    console.error("Repeat customers query error:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Repeat Customers
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              {customers.length} Loyal Buyers
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Customers with more than 1 order and an order placed in the last {repeatDays} days.
          </p>
        </div>

        <Link href="/nn-weblog/settings">
          <Button variant="outline" size="sm" className="text-xs">
            Adjust Timeframe ({repeatDays} days)
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <div className="py-16 text-center">
              <UserCheck className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                No repeat customers found in this window
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Try expanding the repeat customer timeframe in Settings or importing additional historical orders.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Customer</th>
                    <th className="px-6 py-3 font-semibold">Phone</th>
                    <th className="px-6 py-3 font-semibold">Total Orders</th>
                    <th className="px-6 py-3 font-semibold">Latest Order</th>
                    <th className="px-6 py-3 font-semibold">Recent Invoices</th>
                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                        {c.name}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {c.phone}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <Sparkles className="h-3 w-3" />
                          {c.total_orders} Orders
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {formatDate(c.last_order_date)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.orders?.map((o: any) => (
                            <Link key={o.id} href={`/nn-weblog/orders/${o.id}`}>
                              <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:border-blue-400 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                {o.invoice_id}
                                <Badge
                                  status={o.status}
                                  className="text-[9px] px-1 py-0"
                                >
                                  {o.status}
                                </Badge>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/nn-weblog/customers/${c.id}`}>
                          <Button variant="outline" size="sm" className="h-8 text-xs">
                            View Profile
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
