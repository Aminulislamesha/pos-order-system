import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureWeblogTables } from "@/lib/weblog/init-db";
import { formatDate } from "@/lib/weblog/utils";
import {
  History,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Layers,
  CheckCircle2,
  Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit & History Log | NN Weblog",
  description: "Permanent audit log of batch imports, data deletions, and system maintenance events",
};

interface HistoryPageProps {
  searchParams: Promise<{
    action?: string;
  }>;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  await ensureWeblogTables();
  const params = await searchParams;
  const filterAction = params.action || "ALL";

  let logs: any[] = [];
  let errorMsg: string | null = null;

  try {
    const where: any = {};
    if (filterAction !== "ALL") {
      where.action = filterAction;
    }

    logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (err: any) {
    console.error("Failed to load activity logs:", err);
    errorMsg = err?.message || "Failed to load activity logs from database.";
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Audit &amp; History Log
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Permanent timestamped records of batch imports, data resets, and system changes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/nn-weblog/settings">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Settings</span>
            </Button>
          </Link>
          <Link href="/nn-weblog/import">
            <Button size="sm" className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Bulk Import</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Banner if DB Restricted */}
      {errorMsg && (
        <Card className="border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                Database Communication Error
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-400">
                {errorMsg.includes("planLimitReached")
                  ? "Your Prisma Postgres database account has reached its plan limit (planLimitReached). Queries cannot connect until the database plan is upgraded on console.prisma.io or a new database URL is configured."
                  : errorMsg}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase mr-1">
              Filter:
            </span>
            {[
              { label: "All Activities", value: "ALL" },
              { label: "Batch Imports", value: "BULK_IMPORT" },
              { label: "Data Resets", value: "DATA_RESET" },
            ].map((tab) => (
              <Link key={tab.value} href={`/nn-weblog/history?action=${tab.value}`}>
                <Button
                  size="sm"
                  variant={filterAction === tab.value ? "default" : "outline"}
                  className="h-7 text-xs px-3"
                >
                  {tab.label}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              <span>Activity Records ({logs.length})</span>
            </span>
            <span className="text-xs font-normal text-slate-500">
              Showing newest entries first
            </span>
          </CardTitle>
          <CardDescription>
            All critical operational actions are recorded here with exact dates and detailed breakdowns.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                <History className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  No activity records found
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When someone imports an order batch or performs a data reset, detailed timestamps and affected counts will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => {
                const isReset = log.action === "DATA_RESET";
                const isImport = log.action === "BULK_IMPORT";

                const dateObj = new Date(log.createdAt);
                const dateFormatted = formatDate(log.createdAt);
                const timeFormatted = dateObj.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                });

                return (
                  <div
                    key={log.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isReset
                            ? "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                            : isImport
                            ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {isReset ? (
                          <Trash2 className="h-4 w-4" />
                        ) : isImport ? (
                          <FileSpreadsheet className="h-4 w-4" />
                        ) : (
                          <Database className="h-4 w-4" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {log.title}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-bold tracking-wider ${
                              isReset
                                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                                : isImport
                                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                                : log.action.includes("STATEMENT")
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            {log.action}
                          </Badge>
                          {(log.metadata as any)?.batch_note && (
                            <span className="inline-flex items-center rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              Batch: {(log.metadata as any).batch_note}
                            </span>
                          )}
                        </div>

                        {log.details && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                            {log.details}
                          </p>
                        )}

                        {log.metadata && typeof log.metadata === "object" && (
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
                            {Object.entries(log.metadata).map(([k, v]) => {
                              if (k === "timestamp") return null;
                              return (
                                <span
                                  key={k}
                                  className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  <strong className="mr-1 capitalize">
                                    {k.replace(/([A-Z])/g, " $1")}:
                                  </strong>{" "}
                                  {String(v)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="text-right shrink-0 sm:self-start">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {dateFormatted}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {timeFormatted}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
