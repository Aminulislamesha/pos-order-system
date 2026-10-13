"use client";

import React from "react";

interface OrderDetailsViewProps {
  details: string | null | undefined;
  returnedItems?: any;
  className?: string;
}

export function OrderDetailsView({
  details,
  returnedItems,
  className = "",
}: OrderDetailsViewProps) {
  if (!details) {
    return <span className="text-slate-400 italic">No items or notes</span>;
  }

  // Parse returnedItems list (could be array of strings, or array of objects)
  const returnedList: string[] = [];
  if (Array.isArray(returnedItems)) {
    for (const item of returnedItems) {
      if (typeof item === "string") {
        returnedList.push(item.toLowerCase().trim());
      } else if (item && typeof item === "object") {
        const str = (item.name || item.product || item.text || "").toString().toLowerCase().trim();
        if (str) returnedList.push(str);
      }
    }
  }

  // Check if there is an order note prefix like "[Exchange (2 return pants)] "
  let notePrefix = "";
  let itemsContent = details;
  const noteMatch = details.match(/^(\[[^\]]+\])\s*(.*)$/);
  if (noteMatch) {
    notePrefix = noteMatch[1];
    itemsContent = noteMatch[2];
  }

  // If no items were listed after the note prefix, just display the note
  if (!itemsContent.trim()) {
    return (
      <span className={className}>
        <span className="font-semibold text-amber-700 dark:text-amber-400">{notePrefix}</span>
      </span>
    );
  }

  // Split items: Items are typically separated by ", " but names might have ", " like "Coffee, XXL".
  // Note: in bulk-import/route.ts, each item is joined with ", " and ends with " (xN)" or product name.
  // We can match patterns like "(.*?)(?:\\s*\\(x\\d+\\))?(?:,\\s*|$)" or check substring matches.
  // Let's split by items if comma-separated with qty, or handle comma splitting:
  const rawParts = itemsContent.split(/,\s*(?=[^,]+?\s*(?:\(x\d+\)|$))/);

  return (
    <div className={`space-y-1 text-xs ${className}`}>
      {notePrefix && (
        <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
          {notePrefix}
        </div>
      )}
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {rawParts.map((part, index) => {
          const trimmed = part.trim();
          if (!trimmed) return null;

          const isReturned = returnedList.some(
            (ret) =>
              ret &&
              (trimmed.toLowerCase().includes(ret) || ret.includes(trimmed.toLowerCase()))
          );

          return (
            <span
              key={index}
              className={
                isReturned
                  ? "line-through text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/60 font-medium"
                  : "text-slate-700 dark:text-slate-300"
              }
              title={isReturned ? "Returned item (partially canceled)" : undefined}
            >
              {trimmed}
              {index < rawParts.length - 1 && !isReturned ? "," : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
