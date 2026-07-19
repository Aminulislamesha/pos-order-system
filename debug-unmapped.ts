import { prisma } from './lib/prisma';

async function run() {
  const bases = await prisma.baseProduct.findMany();
  const colors = await prisma.color.findMany();
  const sizes = await prisma.size.findMany();

  const flatBases = bases.flatMap(b => [b.name, ...b.aliases].map(v => ({ 
    canonical: b.name, 
    variant: v.toLowerCase(), 
    updatedAt: b.updatedAt,
    colorOrder: b.colorOrder,
    sizeOrder: b.sizeOrder
  })));
  flatBases.sort((a, b) => {
    const lenDiff = b.variant.length - a.variant.length;
    return lenDiff !== 0 ? lenDiff : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const flatColors = colors.flatMap(c => [c.name, ...c.aliases].map(v => ({ 
    canonical: c.name, variant: v.toLowerCase(), updatedAt: c.updatedAt 
  })));
  flatColors.sort((a, b) => {
    const lenDiff = b.variant.length - a.variant.length;
    return lenDiff !== 0 ? lenDiff : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const flatSizes = sizes.flatMap(s => [s.name, ...s.aliases].map(v => ({ 
    canonical: s.name, variant: v.toLowerCase(), updatedAt: s.updatedAt 
  })));
  flatSizes.sort((a, b) => {
    const lenDiff = b.variant.length - a.variant.length;
    return lenDiff !== 0 ? lenDiff : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const rawName = "Snuggly Palazzo - Baby PInk, XXL";
  const rawLower = rawName.toLowerCase();
  
  let matchedBase: string | null = null;
  let matchedColor: string | null = null;
  let matchedSize: string | null = null;
  let matchedBaseObj: any = null;

  for (const f of flatBases) {
    if (rawLower.includes(f.variant)) {
      matchedBase = f.canonical;
      matchedBaseObj = f;
      break;
    }
  }

  for (const f of flatColors) {
    if (matchedBaseObj && matchedBaseObj.colorOrder && matchedBaseObj.colorOrder.length > 0) {
      if (!matchedBaseObj.colorOrder.includes(f.canonical)) continue;
    }
    if (rawLower.includes(f.variant)) {
      matchedColor = f.canonical;
      break;
    }
  }

  for (const f of flatSizes) {
    if (matchedBaseObj && matchedBaseObj.sizeOrder && matchedBaseObj.sizeOrder.length > 0) {
      if (!matchedBaseObj.sizeOrder.includes(f.canonical)) continue;
    }
    const safeVariant = f.variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${safeVariant}\\b`, 'i').test(rawLower)) {
      matchedSize = f.canonical;
      break;
    }
  }

  console.log({ matchedBase, matchedColor, matchedSize });
}
run().catch(console.error);
