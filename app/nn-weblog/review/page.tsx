import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  AlertTriangle,
  RotateCcw,
  PackageCheck,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderReviewCard } from "@/components/weblog/order-review-card";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manual Review Queue | NN Weblog",
  description: "Review and resolve exchange pant mismatches and partial delivery return items",
};

interface ReviewPageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function ManualReviewPage({ searchParams }: ReviewPageProps) {
  await ensureWeblogTables();
  const { filter = "all_pending" } = await searchParams;

  let whereClause: any = {};

  if (filter === "exchange") {
    whereClause = {
      requires_manual_review: true,
      manual_review_status: "EXCHANGE_MISMATCH",
    };
  } else if (filter === "partial") {
    whereClause = {
      requires_manual_review: true,
      manual_review_status: "PARTIAL_DELIVERY_ITEMS",
    };
  } else if (filter === "resolved") {
    whereClause = {
      manual_review_status: "RESOLVED",
    };
  } else {
    // all_pending
    whereClause = {
      requires_manual_review: true,
    };
  }

  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
      take: 100,
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
    }),
    Promise.all([
      prisma.order.count({ where: { requires_manual_review: true } }),
      prisma.order.count({
        where: { requires_manual_review: true, manual_review_status: "EXCHANGE_MISMATCH" },
      }),
      prisma.order.count({
        where: { requires_manual_review: true, manual_review_status: "PARTIAL_DELIVERY_ITEMS" },
      }),
      prisma.order.count({ where: { manual_review_status: "RESOLVED" } }),
    ]),
  ]);

  const [allPendingCount, exchangeCount, partialCount, resolvedCount] = counts;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Manual Review Queue
            </h1>
            {allPendingCount > 0 ? (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                {allPendingCount} Action Required
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Queue Clear
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Verify exchange order item differentials and check off returned items for partial deliveries.
          </p>
        </div>
      </div>

      {/* Filter Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <Link href="/nn-weblog/review?filter=all_pending">
          <Button
            variant={filter === "all_pending" ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 gap-1.5"
          >
            <AlertTriangle className="h-3 w-3" />
            <span>All Pending ({allPendingCount})</span>
          </Button>
        </Link>

        <Link href="/nn-weblog/review?filter=exchange">
          <Button
            variant={filter === "exchange" ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Exchange Mismatches ({exchangeCount})</span>
          </Button>
        </Link>

        <Link href="/nn-weblog/review?filter=partial">
          <Button
            variant={filter === "partial" ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 gap-1.5"
          >
            <PackageCheck className="h-3 w-3" />
            <span>Partial Delivery Items ({partialCount})</span>
          </Button>
        </Link>

        <Link href="/nn-weblog/review?filter=resolved">
          <Button
            variant={filter === "resolved" ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 gap-1.5"
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>Resolved History ({resolvedCount})</span>
          </Button>
        </Link>
      </div>

      {/* Queue Content */}
      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              No orders found in this review queue
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {filter === "resolved"
                ? "No resolved review records found."
                : "All exchange orders and partial delivery returned items have been audited and resolved."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderReviewCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
