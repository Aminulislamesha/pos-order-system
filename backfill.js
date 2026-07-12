const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const locs = await prisma.location.findMany({ orderBy: { createdAt: 'asc' } });
  let counter = 1;
  for (const l of locs) {
    if (!l.uid || !l.uid.startsWith('LOC-')) {
      const uid = 'LOC-' + String(counter).padStart(4, '0');
      await prisma.location.update({ where: { id: l.id }, data: { uid } });
      console.log('Updated', l.name, uid);
      counter++;
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
