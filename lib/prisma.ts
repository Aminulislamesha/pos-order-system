import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Next.js Turbopack evaluates modules at build time.
// Inject a dummy URL if missing so PrismaClient doesn't crash during build.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://dummy:dummy@localhost:5432/dummy";
}

// Ensure the driver is properly configured
const connectionString = process.env.DATABASE_URL;

// Prisma 7.8.0 requires an adapter for Edge/Serverless environments
export const prisma = globalForPrisma.prisma ?? (() => {
  const pool = new Pool({ 
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 20000 
  });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });
  globalForPrisma.prisma = client;
  return client;
})();

globalForPrisma.prisma = prisma;
