export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { getDictionaries, parseProductName } from '@/lib/productParser';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filtersParam = url.searchParams.get('filters');
    const activeFilters = filtersParam ? filtersParam.split(',').filter(Boolean) : [];
    const datesParam = url.searchParams.get('dates');
    const activeDates = datesParam ? datesParam.split(',').filter(Boolean) : [];
    const inclusionsParam = url.searchParams.get('inclusions');
    const activeInclusions = inclusionsParam ? inclusionsParam.split(',').filter(Boolean).map(x => x.toLowerCase()) : [];
    const todayParam = url.searchParams.get('today');

    // Helper to determine today's date in YYYY-MM-DD
    const getTodayDateStr = () => {
      if (todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam)) {
        return todayParam;
      }
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Dhaka',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        return formatter.format(new Date());
      } catch {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }
    };

    const todayDateStr = getTodayDateStr();
    const [todayY, todayM, todayD] = todayDateStr.split('-').map(Number);

    // Helper for date matching
    const getISODate = (serial: string | number) => {
      if (!serial) return "";
      const numericSerial = Number(serial);
      if (isNaN(numericSerial)) {
        const str = String(serial);
        const parts = str.match(/(\d+)\/(\d+)\/(\d+)/);
        if (parts) {
          const day = parts[1].padStart(2, '0');
          const month = parts[2].padStart(2, '0');
          const year = parts[3].length === 2 ? '20' + parts[3] : parts[3];
          return `${year}-${month}-${day}`;
        }
        const cleanStr = str.replace(/at\s+/i, '');
        const dateObj = new Date(cleanStr);
        if (isNaN(dateObj.getTime())) return "";
        return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      } else {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dateObj = new Date(excelEpoch.getTime() + Math.floor(numericSerial) * 86400000);
        return `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
      }
    };

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY 
          ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
          : undefined,
      },
      keyFile: process.env.GOOGLE_PRIVATE_KEY ? undefined : "credentials.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId: '1onvRBeDzZ63vwSCONjA2bpD7X10Npd94KuicJxQpRo4',
      ranges: ['Today!A:CZ'], 
      includeGridData: true,
      fields: 'sheets.data.rowData.values(userEnteredValue,formattedValue,effectiveFormat(backgroundColor,textFormat),note)'
    });

    const rows = response.data.sheets?.[0]?.data?.[0]?.rowData || [];

    // Parse all rows
    const allOrders = rows.map((row: any, rowIndex: number) => {
      if (!row.values) return null;
      const cells = row.values.map((cell: any) => {
        const value = cell.formattedValue || cell.userEnteredValue?.stringValue || cell.userEnteredValue?.numberValue || "";
        const isStrikethrough = cell.effectiveFormat?.textFormat?.strikethrough || false;
        const bg = cell.effectiveFormat?.backgroundColor;
        const isCyan = bg && (bg.red || 0) === 0 && Math.abs((bg.green || 0) - 1) < 0.1 && Math.abs((bg.blue || 0) - 1) < 0.1;
        const isPartial = bg &&
          Math.abs((bg.red || 0) - 136 / 255) < 0.08 &&
          Math.abs((bg.green || 0) - 247 / 255) < 0.08 &&
          Math.abs((bg.blue || 0) - 175 / 255) < 0.08;
        return { value: String(value), strikethrough: isStrikethrough, isCyan, isPartial, note: String(cell.note || "") };
      });

      return {
        originalRowIndex: rowIndex,
        colA: cells[0]?.value || "", // Date
        colB: cells[1]?.value || "", // Order ID
        colC: cells[2]?.value || "", // Status / Dispatch
        colD: cells[3]?.value || "", // Name
        colE: cells[4]?.value || "", // Phone
        colF: cells[5]?.value || "", // Address
        rawDateScore: row.values[0]?.userEnteredValue?.numberValue || row.values[0]?.userEnteredValue?.stringValue || cells[0]?.value || rowIndex,
        cells
      };
    }).filter((row: any) => row && (row.colA !== "" || row.colB !== "")) as any[];

    // Filter based on inclusion/exclusion rules
    const includedOrders: any[] = [];
    const availableFilters = new Set<string>();
    const hasPartialOrders = allOrders.some((o: any) =>
      o.cells?.slice(7, 13).some((c: any) => c.isPartial)
    );

    for (const o of allOrders) {
      const orderId = String(o.colB).trim();
      const colC = String(o.colC).trim();
      const colCLower = colC.toLowerCase();

      // EXCLUSION RULES (overrides everything)
      const isCancelled = /cancelled|cancel/i.test(colCLower);
      const isHold = /\bhold\b/i.test(colCLower);
      const isSeeMessage = /see message/i.test(colCLower);
      const isUnreachable = /unreachable/i.test(colCLower);
      const isSeeWa = /see wa/i.test(colCLower);
      const isNumberOff = /number off/i.test(colCLower);
      const isSeeWhatsapp = /see whatsapp/i.test(colCLower);
      const isStrikethrough = o.cells.slice(7, 13).some((c: any) => c.strikethrough);
      const isCyan = o.cells.slice(7, 13).some((c: any) => c.isCyan);
      const isPartial = o.cells.slice(7, 13).some((c: any) => c.isPartial);

      if (
        (isCancelled && !activeInclusions.includes('cancelled')) ||
        (isHold && !activeInclusions.includes('hold')) ||
        (isSeeMessage && !activeInclusions.includes('see message')) ||
        (isUnreachable && !activeInclusions.includes('unreachable')) ||
        (isSeeWa && !activeInclusions.includes('see wa')) ||
        (isNumberOff && !activeInclusions.includes('number off')) ||
        (isSeeWhatsapp && !activeInclusions.includes('see whatsapp')) ||
        (isStrikethrough && !activeInclusions.includes('strikethrough')) ||
        (isCyan && !activeInclusions.includes('cyan')) ||
        (isPartial && !activeInclusions.includes('partial'))
      ) {
        continue;
      }

      // INCLUSION RULES
      let include = false;
      if (orderId.toUpperCase().startsWith('SC')) {
        include = true;
      } else if (orderId.toUpperCase().startsWith('NN')) {
        const hasValidTag = /\b(C|M|WA|confirmed|confirm|confirm form message|confirm from wa|confirm from whatsapp|confirm from M)\b/i.test(colC);
        const hasValidSuffix = /-exe$/i.test(orderId) || /-exchange$/i.test(orderId);
        if (hasValidTag || hasValidSuffix) {
          include = true;
        }
      }

      if (include) {
        // Find tags for filters
        // Matches VU{number}, D{number}, or fast
        const tagMatches = colC.match(/\b(VU\d+|D\d+|fast)\b/gi);
        if (tagMatches) {
          tagMatches.forEach(tag => availableFilters.add(tag.toUpperCase()));
        }

        includedOrders.push(o);
      }
    }

    // Sort valid orders chronologically
    includedOrders.sort((a: any, b: any) => {
      const aScore = Number(a.rawDateScore) || a.originalRowIndex;
      const bScore = Number(b.rawDateScore) || b.originalRowIndex;
      return aScore - bScore;
    });

    // If active filters exist, filter the orders BEFORE calculating shortages
    let filteredOrders = includedOrders;
    if (activeFilters.length > 0) {
      filteredOrders = includedOrders.filter((o: any) => {
        const colC = String(o.colC).toUpperCase();
        return activeFilters.some(f => colC.includes(f.toUpperCase()));
      });
    }
    
    if (activeDates.length > 0) {
      filteredOrders = filteredOrders.filter((o: any) => {
        const orderIso = getISODate(o.rawDateScore);

        // If the order's date was not selected in the calendar, do NOT remove it: keep it!
        if (!activeDates.includes(orderIso)) {
          return true;
        }

        // The order IS on one of the selected dates.
        // It must be removed UNLESS it has a VU or D tag for today's date or a previous date:
        const colC = String(o.colC || '').trim();

        // Match VU or D tags followed by day number, e.g. VU15, D15, VU14, D13, VU16, etc.
        const tagMatches = [...colC.matchAll(/\b(?:VU|D|dispatch)[-\s]*(\d+)\b/gi)];

        if (tagMatches.length > 0) {
          const hasPastOrTodayTag = tagMatches.some((m) => {
            const tagDay = parseInt(m[1], 10);

            if (orderIso) {
              const [orderY, orderM, orderD] = orderIso.split('-').map(Number);
              // If order is in the same month as today:
              if (orderY === todayY && orderM === todayM) {
                return tagDay <= todayD;
              }
              // If order is across months (e.g. order in previous month):
              let tagY = orderY;
              let tagM = orderM;
              if (tagDay < orderD) {
                tagM += 1;
                if (tagM > 12) {
                  tagM = 1;
                  tagY += 1;
                }
              }
              const tagDateStr = `${tagY}-${String(tagM).padStart(2, '0')}-${String(tagDay).padStart(2, '0')}`;
              return tagDateStr <= todayDateStr;
            }

            return tagDay <= todayD;
          });

          if (hasPastOrTodayTag) {
            // Do NOT remove this order!
            return true;
          }
        } else if (/\bVU\b/i.test(colC)) {
          // Plain 'VU' without a number means Very Urgent (due immediately/today), so keep it
          return true;
        }

        // All other orders from the selected dates are removed
        return false;
      });
    }

    // Extract Demand
    const demandMap = new Map<string, number>(); // canonicalName -> required qty

    const { flatBases, flatColors, flatSizes } = await getDictionaries();

    // Fetch Database State first to build the aliasMap so we can prefer explicit mapping
    const products = await prisma.product.findMany({
      include: {
        aliases: true,
        inventory: true
      }
    });

    const inventoryPool = new Map<string, number>(); // canonical ID -> total stock
    const aliasMap = new Map<string, any>(); // raw name lowercase -> canonical Product

    products.forEach((p: any) => {
      const total = p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
      inventoryPool.set(p.id, total);
      aliasMap.set(p.name.toLowerCase(), p);
      p.aliases.forEach((a: any) => aliasMap.set(a.alias.toLowerCase(), p));
    });

    // Fetch active partial packages to deduct already packed quantities (Option 1)
    const activePartialPackages = await prisma.partialPackage.findMany({
      where: { isFulfilled: false }
    });

    const partialOrderMap = new Map<string, Map<string, number>>();
    activePartialPackages.forEach((pkg: any) => {
      const pMap = new Map<string, number>();
      if (Array.isArray(pkg.packedProducts)) {
        pkg.packedProducts.forEach((p: any) => {
          if (p.name) {
            pMap.set(String(p.name).trim().toLowerCase(), Number(p.packedQty) || 0);
          }
        });
      }
      partialOrderMap.set(String(pkg.orderId).trim().toLowerCase(), pMap);
    });

    filteredOrders.forEach((o: any) => {
      const orderProducts = [];
      const orderIdLower = String(o.colB).trim().toLowerCase();
      const packedMap = partialOrderMap.get(orderIdLower);

      for (let i = 11; i < o.cells.length; i += 2) {
        const pName = String(o.cells[i]?.value || "").trim();
        const pQty = parseInt(String(o.cells[i + 1]?.value || "1"), 10) || 1;
        
        if (pName && pName !== "NaN") {
          // If this is a partial order, deduct already packed items so factory only produces the unpacked remainder
          let neededQty = pQty;
          if (packedMap) {
            const packedQty = packedMap.get(pName.toLowerCase()) ?? 0;
            neededQty = Math.max(0, pQty - packedQty);
          }

          if (neededQty > 0) {
            const rawLower = pName.toLowerCase();
            
            let resolvedCanonicalName = pName; // default to raw if we fail

            // 1. Try explicit alias map
            if (aliasMap.has(rawLower)) {
              resolvedCanonicalName = aliasMap.get(rawLower).name;
            } else {
              // 2. Try intelligent parsing
              const parsed = parseProductName(pName, flatBases, flatColors, flatSizes);
              if (parsed.success && parsed.canonicalName) {
                resolvedCanonicalName = parsed.canonicalName;
              }
            }

            orderProducts.push({ rawName: resolvedCanonicalName, qty: neededQty, cellIndex: i });
            const current = demandMap.get(resolvedCanonicalName.toLowerCase()) || 0;
            demandMap.set(resolvedCanonicalName.toLowerCase(), current + neededQty);
          }
        }
      }
      o.orderProducts = orderProducts;
    });

    // Calculate Final Factory List (Shortages)
    // Group demand by Canonical ID
    const canonicalDemand = new Map<string, number>();
    const unmappedDemand = new Map<string, number>();

    for (const [rawNameLower, demand] of demandMap.entries()) {
      const canonical = aliasMap.get(rawNameLower);
      if (canonical) {
        canonicalDemand.set(canonical.id, (canonicalDemand.get(canonical.id) || 0) + demand);
      } else {
        // Preserve original case for unmapped if possible, but we only have lower here. 
        unmappedDemand.set(rawNameLower, (unmappedDemand.get(rawNameLower) || 0) + demand);
      }
    }

    const factoryList: any[] = [];

    // Track exact shortages to filter order display
    const factoryCanonicalIds = new Set<string>();
    const factoryUnmappedNames = new Set<string>();

    // For mapped products
    for (const [canonicalId, demand] of canonicalDemand.entries()) {
      const currentStock = inventoryPool.get(canonicalId) || 0;
      if (currentStock < demand) {
        factoryCanonicalIds.add(canonicalId);
        const product = products.find((p: any) => p.id === canonicalId);
        if (product) {
          factoryList.push({
            name: product.name,
            requiredQty: demand - currentStock,
            isMapped: true
          });
        }
      }
    }

    // For unmapped products
    for (const [rawNameLower, demand] of unmappedDemand.entries()) {
      factoryUnmappedNames.add(rawNameLower);
      factoryList.push({
        name: rawNameLower, // unmapped
        requiredQty: demand,
        isMapped: false
      });
    }

    // Sort factory list alphabetically
    factoryList.sort((a, b) => a.name.localeCompare(b.name));

    // Filter filteredOrders to ONLY include products causing the shortage
    // To identify exactly WHICH orders contribute to the shortage, we simulate chronological fulfillment.
    const runningStock = new Map<string, number>();
    for (const [id, stock] of inventoryPool.entries()) {
      runningStock.set(id, stock);
    }
    
    const exactShortageOrders = [];
    for (const o of filteredOrders) {
      const shortageProducts = [];
      
      for (const item of o.orderProducts) {
        let isShortage = false;
        let shortageQty = 0;
        
        const canonical = aliasMap.get(item.rawName.toLowerCase());
        if (canonical) {
          if (factoryCanonicalIds.has(canonical.id)) {
            isShortage = true;
            const currentStock = runningStock.get(canonical.id) || 0;
            if (currentStock >= item.qty) {
              runningStock.set(canonical.id, currentStock - item.qty);
              shortageQty = 0; 
            } else if (currentStock > 0) {
              runningStock.set(canonical.id, 0);
              shortageQty = item.qty - currentStock; 
            } else {
              shortageQty = item.qty; 
            }
          }
        } else {
          if (factoryUnmappedNames.has(item.rawName.toLowerCase())) {
            isShortage = true;
            shortageQty = item.qty;
          }
        }
        
        if (isShortage && shortageQty > 0) {
          shortageProducts.push({ ...item, shortageQty });
        }
      }
      
      if (shortageProducts.length > 0) {
        // Deep copy the order object, replace orderProducts, and keep cells for formatting
        exactShortageOrders.push({
           colA: o.colA,
           colB: o.colB,
           colC: o.colC,
           colD: o.colD,
           colE: o.colE,
           colF: o.colF,
           cells: o.cells,
           orderProducts: shortageProducts
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: {
        availableFilters: Array.from(availableFilters).sort(),
        orders: exactShortageOrders,
        factoryList,
        hasPartialOrders
      } 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
