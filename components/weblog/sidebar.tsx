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
  ClipboardCheck,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
  History,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/weblog/utils";
import { useSidebar } from "./sidebar-context";
import { Button } from "@/components/ui/button";

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
    name: "Steadfast Statements",
    href: "/nn-weblog/statements",
    icon: FileSpreadsheet,
    badge: "Reconcile",
  },
  {
    name: "Review Queue",
    href: "/nn-weblog/review",
    icon: ClipboardCheck,
  },
  {
    name: "Product & Sales Stats",
    href: "/nn-weblog/stats",
    icon: BarChart3,
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
    name: "Audit & History Log",
    href: "/nn-weblog/history",
    icon: History,
  },
  {
    name: "Settings",
    href: "/nn-weblog/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-slate-200 dark:border-slate-800 transition-all duration-300",
          isCollapsed ? "justify-center px-2" : "justify-between px-4"
        )}
      >
        <Link
          href="/nn-weblog"
          className={cn("flex items-center gap-3 overflow-hidden", isCollapsed && "justify-center")}
          title="NN Weblog"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Package className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <span className="font-bold tracking-tight text-slate-900 dark:text-white block truncate">
                NN Weblog
              </span>
              <span className="block text-[11px] font-medium text-slate-400 truncate">
                Order Management
              </span>
            </div>
          )}
        </Link>

        {!isCollapsed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 shrink-0"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {!isCollapsed && (
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Main Menu
          </div>
        )}
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
                title={item.name}
                className={cn(
                  "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                  isCollapsed ? "justify-center px-2" : "justify-between px-3",
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                )}
              >
                <div
                  className={cn(
                    "flex items-center",
                    isCollapsed ? "justify-center" : "gap-3 truncate"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-400"
                    )}
                  />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </div>
                {!isCollapsed && item.badge && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 shrink-0">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Courier & POS Navigation Footer */}
      <div className="border-t border-slate-200 p-2.5 dark:border-slate-800 space-y-2">
        <Link
          href="/"
          className={cn(
            "flex items-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-200/60 dark:border-indigo-800/40",
            isCollapsed ? "justify-center p-2.5" : "justify-between px-3 py-2"
          )}
          title="Back to POS Home"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-indigo-600 shrink-0" />
            {!isCollapsed && <span>POS Application</span>}
          </span>
          {!isCollapsed && (
            <ArrowLeft className="h-3.5 w-3.5 text-indigo-500 rotate-180 shrink-0" />
          )}
        </Link>

        {isCollapsed ? (
          <div
            className="flex items-center justify-center rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/30"
            title="Packzy / Steadfast Live"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/30">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="truncate">Packzy / Steadfast Live</span>
          </div>
        )}
      </div>
    </aside>
  );
}
