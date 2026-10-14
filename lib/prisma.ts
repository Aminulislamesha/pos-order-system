import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Inject Neon / Vercel Storage / fallback URL
const dbUrl =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_URL ||
  process.env.STORAGE_URL ||
  "postgres://dummy:dummy@localhost:5432/dummy";

process.env.DATABASE_URL = dbUrl;
const connectionString = dbUrl;

// Prisma 7.8.0 requires an adapter for Edge/Serverless environments
export const prisma = globalForPrisma.prisma ?? (() => {
  const pool = new Pool({ 
    connectionString,
    max: 10,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000 
  });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });
  globalForPrisma.prisma = client;
  return client;
})();

globalForPrisma.prisma = prisma;
