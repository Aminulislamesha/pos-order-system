import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ClockAlert, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/weblog/utils";
import { FollowUpButton } from "@/components/weblog/follow-up-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pending Follow-ups | NN Weblog",
  description: "Customers requiring customer-success outreach due to order inactivity",
};

import { ensureWeblogTables } from "@/lib/weblog/init-db";

export default async function FollowUpsPage() {
  await ensureWeblogTables();
  let inactivityDays = 30;
  let customers: any[] = [];

  try {
    const inactivitySetting = await prisma.settings.findUnique({
      where: { key: "inactivity_days" },
    });
    inactivityDays = parseInt(inactivitySetting?.value || "30", 10);

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - inactivityDays);

    customers = await prisma.customer.findMany({
      where: {
        last_order_date: { lt: thresholdDate },
        is_followed_up: false,
      },
      orderBy: {
        last_order_date: "asc",
      },
      include: {
        _count: { select: { orders: true } },
      },
    });
  } catch (err) {
    console.error("Follow-ups query error:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Pending Follow-Ups
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              {customers.length} Needing Outreach
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Customers with no order for more than {inactivityDays} days who haven&rsquo;t been followed up yet.
          </p>
        </div>

        <Link href="/nn-weblog/settings">
          <Button variant="outline" size="sm" className="text-xs">
            Adjust Threshold ({inactivityDays} days)
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                All caught up!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                No customers are currently exceeding the {inactivityDays}-day inactivity threshold.
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
                    <th className="px-6 py-3 font-semibold">Last Order Date</th>
                    <th className="px-6 py-3 font-semibold">Inactivity Period</th>
                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {customers.map((c) => {
                    const daysAgo = c.last_order_date
                      ? Math.floor(
                          (Date.now() - new Date(c.last_order_date).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : 0;

                    const orderCount = Math.max(c.total_orders, c._count?.orders ?? 0, 1);

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                          {c.name}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                          {c.phone}
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {orderCount} {orderCount === 1 ? "order" : "orders"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {formatDate(c.last_order_date)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <ClockAlert className="h-3 w-3" />
                            {daysAgo} days ago
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <FollowUpButton
                              customerId={c.id}
                              isFollowedUp={c.is_followed_up}
                            />
                            <Link href={`/nn-weblog/customers/${c.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                              >
                                View Profile
                              </Button>
                            </Link>
                          </div>
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
    </div>
  );
}
