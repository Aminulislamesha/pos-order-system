"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface StatsProductFilterProps {
  baseProducts: Array<{ name: string }>;
  selectedProduct: string;
}

export function StatsProductFilter({ baseProducts, selectedProduct }: StatsProductFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("product", val);
    } else {
      params.delete("product");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-400 uppercase">Product:</span>
      <select
        value={selectedProduct}
        onChange={handleChange}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">All Products</option>
        {baseProducts.map((bp) => (
          <option key={bp.name} value={bp.name}>
            {bp.name}
          </option>
        ))}
      </select>
    </div>
  );
}
