import { prisma } from "@/lib/prisma";

let initPromise: Promise<void> | null = null;

export async function ensureWeblogTables() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Customer" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "phone" TEXT NOT NULL,
          "total_orders" INTEGER NOT NULL DEFAULT 0,
          "last_order_date" TIMESTAMP(3),
          "last_follow_up_date" TIMESTAMP(3),
          "is_followed_up" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Customer_phone_key" ON "Customer"("phone");
        CREATE INDEX IF NOT EXISTS "Customer_name_idx" ON "Customer"("name");
        CREATE INDEX IF NOT EXISTS "Customer_last_order_date_idx" ON "Customer"("last_order_date");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Order" (
          "id" TEXT NOT NULL,
          "invoice_id" TEXT NOT NULL,
          "customer_id" TEXT NOT NULL,
          "date" TIMESTAMP(3) NOT NULL,
          "address" TEXT NOT NULL,
          "details" TEXT,
          "total_bill" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
          "delivery_charge" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "tracking_code" TEXT,
          "consignment_id" TEXT,
          "last_status_checked_at" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "Order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Order_invoice_id_key" ON "Order"("invoice_id");
        CREATE INDEX IF NOT EXISTS "Order_customer_id_idx" ON "Order"("customer_id");
        CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
        CREATE INDEX IF NOT EXISTS "Order_date_idx" ON "Order"("date");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TrackingHistory" (
          "id" TEXT NOT NULL,
          "order_id" TEXT NOT NULL,
          "previous_status" TEXT,
          "new_status" TEXT NOT NULL,
          "message" TEXT,
          "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TrackingHistory_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "TrackingHistory_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TrackingHistory_order_id_idx" ON "TrackingHistory"("order_id");
        CREATE INDEX IF NOT EXISTS "TrackingHistory_timestamp_idx" ON "TrackingHistory"("timestamp");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Settings" (
          "id" TEXT NOT NULL,
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Settings_key_key" ON "Settings"("key");
      `);
    } catch (e) {
      console.error("Error creating weblog tables in database:", e);
    }
  })();

  return initPromise;
}
