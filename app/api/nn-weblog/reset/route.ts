import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

export async function POST() {
  try {
    await ensureWeblogTables();

    // Delete NN Weblog data in order of foreign key dependencies:
    // 1. TrackingHistory (depends on Order)
    // 2. Order (depends on Customer)
    // 3. Customer
    const [deletedTracking, deletedOrders, deletedCustomers] = await prisma.$transaction([
      prisma.trackingHistory.deleteMany({}),
      prisma.order.deleteMany({}),
      prisma.customer.deleteMany({}),
    ]);

    // 4. Record event into ActivityLog so it is permanently auditable
    await prisma.activityLog.create({
      data: {
        action: "DATA_RESET",
        title: "All application data cleared",
        details: `Application data reset: Deleted ${deletedOrders.count} orders, ${deletedCustomers.count} customers, and ${deletedTracking.count} tracking records.`,
        metadata: {
          orders: deletedOrders.count,
          customers: deletedCustomers.count,
          trackingHistory: deletedTracking.count,
          timestamp: new Date().toISOString(),
        },
      },
    }).catch((e) => console.error("Failed to write reset activity log:", e));

    return NextResponse.json({
      success: true,
      message: "NN Weblog application reset successfully.",
      counts: {
        trackingHistory: deletedTracking.count,
        orders: deletedOrders.count,
        customers: deletedCustomers.count,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to reset NN Weblog data";
    console.error("NN Weblog reset error:", error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
