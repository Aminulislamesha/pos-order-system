import * as React from "react";
import { cn } from "@/lib/weblog/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  indicatorColor?: string;
}

export function Progress({
  value,
  className,
  indicatorColor = "bg-blue-600",
  ...props
}: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value || 0));

  return (
    <div
      className={cn(
        "relative h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800",
        className
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedValue}
      {...props}
    >
      <div
        className={cn("h-full transition-all duration-300 ease-out", indicatorColor)}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
