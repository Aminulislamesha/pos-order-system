import { prisma } from './lib/prisma';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const locs = await prisma.location.findMany({
    include: {
      inventory: {
        include: { product: true }
      }
    }
  });
  const data = locs.map(l => ({
    name: l.name,
    inv: l.inventory.map(i => ({ p: i.product.name, q: i.quantity }))
  }));
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
