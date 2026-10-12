"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TableProperties,
  Package,
  Users,
  ClockAlert,
  UserCheck,
  Settings,
  Webhook,
  ShieldCheck,
  ArrowLeft,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/weblog/utils";

const NAV_ITEMS = [
  {
    name: "Dashboard",
    href: "/nn-weblog",
    icon: LayoutDashboard,
  },
  {
    name: "Bulk Import Grid",
    href: "/nn-weblog/import",
    icon: TableProperties,
    badge: "5k Rows",
  },
  {
    name: "Orders",
    href: "/nn-weblog/orders",
    icon: Package,
  },
  {
    name: "Customers",
    href: "/nn-weblog/customers",
    icon: Users,
  },
  {
    name: "Pending Follow-ups",
    href: "/nn-weblog/follow-ups",
    icon: ClockAlert,
  },
  {
    name: "Repeat Customers",
    href: "/nn-weblog/repeat-customers",
    icon: UserCheck,
  },
  {
    name: "Webhook Simulator",
    href: "/nn-weblog/webhook-tester",
    icon: Webhook,
  },
  {
    name: "Settings",
    href: "/nn-weblog/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <span className="font-bold tracking-tight text-slate-900 dark:text-white">
            NN Weblog
          </span>
          <span className="block text-[11px] font-medium text-slate-400">
            Order Management
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Main Menu
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/nn-weblog"
                ? pathname === "/nn-weblog"
                : pathname.startsWith(item.href);

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isActive
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-400"
                    )}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Courier & POS Navigation Footer */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800 space-y-2.5">
        <Link
          href="/"
          className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-200/60 dark:border-indigo-800/40"
          title="Back to POS Home"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-indigo-600" />
            <span>POS Application</span>
          </span>
          <ArrowLeft className="h-3.5 w-3.5 text-indigo-500 rotate-180" />
        </Link>

        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/30">
          <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span className="truncate">Packzy / Steadfast Live</span>
        </div>
      </div>
    </aside>
  );
}
