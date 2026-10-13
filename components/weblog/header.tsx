"use client";

import * as React from "react";
import Link from "next/link";
import { GlobalSearch } from "./global-search";
import { PlusCircle, ShoppingCart, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./sidebar-context";

export function Header() {
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-4 md:px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="h-9 w-9 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 shrink-0"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>
        <div className="flex-1">
          <GlobalSearch />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-slate-700 dark:text-slate-200">
            <ShoppingCart className="h-3.5 w-3.5 text-indigo-500" />
            <span>POS System</span>
          </Button>
        </Link>

        <Link href="/nn-weblog/import">
          <Button size="sm" className="gap-1.5 shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
            <PlusCircle className="h-4 w-4" />
            <span>Bulk Import</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}
