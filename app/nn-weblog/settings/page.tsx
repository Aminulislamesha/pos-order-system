import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/weblog/settings-form";
import { ProductCostSettings } from "@/components/weblog/product-cost-settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | NN Weblog",
  description: "Configure system inactivity thresholds, product making costs, and retention analytics",
};

import { ensureWeblogTables } from "@/lib/weblog/init-db";

export default async function SettingsPage() {
  await ensureWeblogTables();
  const settingsMap: Record<string, string> = {
    inactivity_days: "30",
    repeat_customer_days: "30",
  };

  try {
    const records = await prisma.settings.findMany();
    for (const s of records) {
      settingsMap[s.key] = s.value;
    }
  } catch (err) {
    console.error("Settings query error:", err);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          System Settings
        </h1>
        <p className="text-sm text-slate-500">
          Manage operational thresholds, 1pc product making costs, and automated customer flags
        </p>
      </div>

      <ProductCostSettings />

      <SettingsForm initialSettings={settingsMap} />
    </div>
  );
}
