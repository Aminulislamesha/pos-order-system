import { prisma } from '@/lib/prisma';

let cachedDictionaries: any = null;
let lastCacheTime = 0;
const CACHE_TTL = 1000 * 60; // 1 minute

export async function getDictionaries() {
  if (cachedDictionaries && (Date.now() - lastCacheTime) < CACHE_TTL) {
    return cachedDictionaries;
  }

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

  cachedDictionaries = { flatBases, flatColors, flatSizes };
  lastCacheTime = Date.now();
  return cachedDictionaries;
}

export function parseProductName(rawName: string, flatBases: any[], flatColors: any[], flatSizes: any[]) {
  const rawLower = rawName.toLowerCase();
  
  let matchedBase = null;
  let matchedColor = null;
  let matchedSize = null;
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

  if (matchedBase && matchedColor && matchedSize) {
    return {
      success: true,
      canonicalName: `${matchedBase} - ${matchedColor} / ${matchedSize}`,
      commaName: `${matchedBase} - ${matchedColor}, ${matchedSize}`
    };
  }

  return { success: false };
}
