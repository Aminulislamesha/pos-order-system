import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/weblog/settings-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | NN Weblog",
  description: "Configure system inactivity thresholds and retention analytics",
};

export default async function SettingsPage() {
  const records = await prisma.settings.findMany();
  const settingsMap: Record<string, string> = {
    inactivity_days: "30",
    repeat_customer_days: "30",
  };

  for (const s of records) {
    settingsMap[s.key] = s.value;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          System Settings
        </h1>
        <p className="text-sm text-slate-500">
          Manage operational thresholds and automated customer flags
        </p>
      </div>

      <SettingsForm initialSettings={settingsMap} />
    </div>
  );
}
