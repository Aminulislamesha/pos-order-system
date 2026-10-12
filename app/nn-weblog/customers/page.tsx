import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Users, Search, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/weblog/utils";

export const dynamic = "force-dynamic";

interface CustomersPageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const page = parseInt(params.page || "1", 10);
  const pageSize = 25;

  const whereClause: Record<string, unknown> = {};
  if (query) {
    whereClause.OR = [
      { phone: { contains: query } },
      { name: { contains: query, mode: "insensitive" } },
    ];
  }

  const [totalCount, customers] = await Promise.all([
    prisma.customer.count({ where: whereClause }),
    prisma.customer.findMany({
      where: whereClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { orders: true } },
      },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Customers
          </h1>
          <p className="text-sm text-slate-500">
            {totalCount.toLocaleString()} customers registered across all orders
          </p>
        </div>

        <form method="GET" className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search name or phone..."
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No customers found.</p>
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
                    <th className="px-6 py-3 font-semibold">Follow-Up Status</th>
                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {customers.map((c) => (
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
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                          {c.total_orders} orders
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {formatDate(c.last_order_date)}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {c.is_followed_up ? (
                          <span className="text-emerald-600 font-medium flex items-center gap-1">
                            <UserCheck className="h-3.5 w-3.5" /> Followed Up
                          </span>
                        ) : (
                          <span className="text-slate-400">Regular</span>
                        )}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 && (
                  <Link
                    href={`/nn-weblog/customers?page=${page - 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  >
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      Previous
                    </Button>
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/nn-weblog/customers?page=${page + 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
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
