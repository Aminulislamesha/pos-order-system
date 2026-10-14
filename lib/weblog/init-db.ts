import { prisma } from "@/lib/prisma";

const globalForInit = globalThis as unknown as {
  weblogTablesInitialized?: boolean;
};

let initPromise: Promise<void> | null = null;

export async function ensureWeblogTables() {
  if (globalForInit.weblogTablesInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Check if tables already exist to skip heavy DDL
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 FROM "Order" LIMIT 1;`);
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "ActivityLog" (
            "id" TEXT NOT NULL,
            "action" TEXT NOT NULL,
            "title" TEXT NOT NULL,
            "details" TEXT,
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
          );
          CREATE INDEX IF NOT EXISTS "ActivityLog_action_idx" ON "ActivityLog"("action");
          CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
        `).catch(() => {});
        globalForInit.weblogTablesInitialized = true;
        return;
      } catch {
        // Table doesn't exist yet, proceed with creation
      }
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
        ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_invoice_id_key";
        DROP INDEX IF EXISTS "Order_invoice_id_key";
        CREATE INDEX IF NOT EXISTS "Order_invoice_id_idx" ON "Order"("invoice_id");
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

      // 1. Customer schema additions (profile_note, addresses, alternate_phones)
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "profile_note" TEXT;
        ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "addresses" TEXT[] NOT NULL DEFAULT '{}';
        ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "alternate_phones" TEXT[] NOT NULL DEFAULT '{}';
      `);

      // 2. Order schema additions (cod, net_receivable, timestamps, review status, etc.)
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cod_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "net_receivable" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "steadfast_created_at" TIMESTAMP(3);
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "delivery_date" TIMESTAMP(3);
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "return_date" TIMESTAMP(3);
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "return_status" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellation_type" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "requires_manual_review" BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "manual_review_status" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "returned_items" TEXT;
        CREATE INDEX IF NOT EXISTS "Order_consignment_id_idx" ON "Order"("consignment_id");
        CREATE INDEX IF NOT EXISTS "Order_requires_manual_review_idx" ON "Order"("requires_manual_review");
      `);

      // 3. ProductCost table
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductCost" (
          "id" TEXT NOT NULL,
          "base_product_name" TEXT NOT NULL,
          "cost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
          "effective_from" TIMESTAMP(3),
          "effective_to" TIMESTAMP(3),
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "ProductCost_base_product_name_idx" ON "ProductCost"("base_product_name");

        CREATE TABLE IF NOT EXISTS "ActivityLog" (
          "id" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "details" TEXT,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "ActivityLog_action_idx" ON "ActivityLog"("action");
        CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

        CREATE TABLE IF NOT EXISTS "SteadfastStatement" (
          "id" TEXT NOT NULL,
          "order_id" TEXT NOT NULL,
          "tracking_code" TEXT,
          "invoice" TEXT NOT NULL,
          "recipient_name" TEXT,
          "recipient_phone" TEXT,
          "recipient_address" TEXT,
          "delivery_status" TEXT,
          "approval_status" TEXT,
          "delivery_time" TEXT,
          "rider_name" TEXT,
          "rider_phone" TEXT,
          "cod_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
          "shipping_charge" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
          "cod_charge" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
          "payment_status" TEXT,
          "note" TEXT,
          "created_at_courier" TEXT,
          "approved_at" TEXT,
          "is_matched" BOOLEAN NOT NULL DEFAULT false,
          "matched_order_id" TEXT,
          "matched_at" TIMESTAMP(3),
          "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SteadfastStatement_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "SteadfastStatement_order_id_key" ON "SteadfastStatement"("order_id");
        CREATE INDEX IF NOT EXISTS "SteadfastStatement_invoice_idx" ON "SteadfastStatement"("invoice");
        CREATE INDEX IF NOT EXISTS "SteadfastStatement_is_matched_idx" ON "SteadfastStatement"("is_matched");
      `);

      // 4. Auto-repair customer total_orders if any customer has orders but total_orders is 0
      await prisma.$executeRawUnsafe(`
        UPDATE "Customer" c
        SET total_orders = sub.cnt
        FROM (
          SELECT customer_id, GREATEST(1, COUNT(DISTINCT id)) as cnt
          FROM "Order"
          GROUP BY customer_id
        ) sub
        WHERE c.id = sub.customer_id AND c.total_orders = 0;
      `);
      globalForInit.weblogTablesInitialized = true;
    } catch (e) {
      console.error("Error creating weblog tables in database:", e);
    }
  })();

  return initPromise;
}
