import { prisma } from './lib/prisma';

async function run() {
  const p = await prisma.product.findMany({
    where: { name: { contains: 'Snuggly Palazzo' } }
  });
  console.log("Canonical Products:");
  p.forEach(x => console.log(x.name));
}

run().catch(console.error);
