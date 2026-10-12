import * as React from "react";
import Link from "next/link";
import { GlobalSearch } from "./global-search";
import { PlusCircle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex-1 max-w-xl">
        <GlobalSearch />
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
