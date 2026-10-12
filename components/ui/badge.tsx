import * as React from "react";
import { cn } from "@/lib/weblog/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "success"
    | "warning"
    | "destructive"
    | "info";
  status?: string;
}

export function Badge({ className, variant = "default", status, ...props }: BadgeProps) {
  let effectiveVariant = variant;

  if (status) {
    const s = status.toLowerCase();
    if (s.includes("delivered") && !s.includes("partial")) {
      effectiveVariant = "success";
    } else if (s.includes("partial")) {
      effectiveVariant = "warning";
    } else if (s.includes("cancel") || s.includes("return")) {
      effectiveVariant = "destructive";
    } else if (s.includes("transit") || s.includes("dispatch")) {
      effectiveVariant = "info";
    } else if (s.includes("hold") || s.includes("delay")) {
      effectiveVariant = "warning";
    } else if (s.includes("pending") || s.includes("review")) {
      effectiveVariant = "secondary";
    }
  }

  const variantStyles = {
    default: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    secondary: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    outline: "text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    destructive: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize transition-colors",
        variantStyles[effectiveVariant],
        className
      )}
      {...props}
    />
  );
}
