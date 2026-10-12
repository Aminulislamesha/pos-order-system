"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, User, Package, ArrowRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/weblog/utils";

interface SearchCustomer {
  id: string;
  name: string;
  phone: string;
  total_orders: number;
}

interface SearchOrder {
  id: string;
  invoice_id: string;
  date: string;
  status: string;
  total_bill: number;
  customer?: {
    name: string;
    phone: string;
  };
}

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<{
    customers: SearchCustomer[];
    orders: SearchOrder[];
  }>({ customers: [], orders: [] });

  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults({ customers: [], orders: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nn-weblog/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch (err) {
        console.error("Search fetch error:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectCustomer = (id: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(`/nn-weblog/customers/${id}`);
  };

  const handleSelectOrder = (id: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(`/nn-weblog/orders/${id}`);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          placeholder="Search phone, customer name, invoice ID... (Ctrl+K)"
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
        ) : query ? (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isOpen && (results.customers.length > 0 || results.orders.length > 0 || (query.length >= 2 && !loading)) && (
        <div className="absolute left-0 top-12 z-50 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95 max-h-[460px] overflow-y-auto">
          {results.customers.length === 0 && results.orders.length === 0 && !loading ? (
            <div className="py-6 text-center text-sm text-slate-500">
              No matching customers or invoices found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="space-y-4">
              {results.customers.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-blue-500" /> Customers
                    </span>
                    <span>{results.customers.length} found</span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {results.customers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCustomer(c.id)}
                        className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{c.name}</div>
                          <div className="text-xs text-slate-500 font-mono">{c.phone}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                            {c.total_orders} {c.total_orders === 1 ? "order" : "orders"}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.orders.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-indigo-500" /> Orders
                    </span>
                    <span>{results.orders.length} found</span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {results.orders.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => handleSelectOrder(o.id)}
                        className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {o.invoice_id}
                            </span>
                            <Badge status={o.status} className="text-[10px] py-0 px-1.5">
                              {o.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500">
                            {o.customer?.name} ({o.customer?.phone}) • {formatDate(o.date)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                            {formatCurrency(o.total_bill)}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
