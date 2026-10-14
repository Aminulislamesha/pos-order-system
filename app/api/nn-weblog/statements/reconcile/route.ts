import { NextResponse } from "next/server";
import { ensureWeblogTables } from "@/lib/weblog/init-db";
import { matchAllPendingStatements } from "@/lib/weblog/reconcile-statements";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    await ensureWeblogTables();
    const { reconciledCount, remainingPending } = await matchAllPendingStatements();

    if (reconciledCount > 0) {
      await prisma.activityLog.create({
        data: {
          action: "STATEMENT_RECONCILE",
          title: "Steadfast Statement Re-matching Executed",
          details: `Re-ran statement matching against orders: successfully reconciled ${reconciledCount} orders. ${remainingPending} statement rows remaining.`,
          metadata: { reconciledCount, remainingPending },
        },
      });
    }

    return NextResponse.json({
      success: true,
      reconciledCount,
      remainingPending,
      message: `Reconciled ${reconciledCount} orders with stored statements.`,
    });
  } catch (err: unknown) {
    console.error("Statement reconcile error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run reconciliation" },
      { status: 500 }
    );
  }
}
