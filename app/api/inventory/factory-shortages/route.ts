export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filtersParam = url.searchParams.get('filters');
    const activeFilters = filtersParam ? filtersParam.split(',').filter(Boolean) : [];
    const datesParam = url.searchParams.get('dates');
    const activeDates = datesParam ? datesParam.split(',').filter(Boolean) : [];

    // Helper for date matching
    const getISODate = (serial: string | number) => {
      if (!serial) return "";
      const numericSerial = Number(serial);
      if (isNaN(numericSerial)) {
        const dateObj = new Date(String(serial));
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
      ranges: ['Today!A:ZZ'], 
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
        const isCyan = bg && bg.red === 0 && Math.abs((bg.green || 0) - 1) < 0.1 && Math.abs((bg.blue || 0) - 1) < 0.1;
        return { value: String(value), strikethrough: isStrikethrough, isCyan, note: String(cell.note || "") };
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

    for (const o of allOrders) {
      const orderId = String(o.colB).trim();
      const colC = String(o.colC).trim();
      const colCLower = colC.toLowerCase();

      // EXCLUSION RULES (overrides everything)
      if (
        /cancelled|cancel/i.test(colCLower) ||
        /\bhold\b/i.test(colCLower) ||
        /see message/i.test(colCLower) ||
        /unreachable/i.test(colCLower) ||
        /see wa/i.test(colCLower) ||
        /number off/i.test(colCLower) ||
        /see whatsapp/i.test(colCLower) ||
        o.cells[1]?.strikethrough ||
        o.cells.some((c: any) => c.isCyan)
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
        const iso = getISODate(o.rawDateScore);
        return activeDates.includes(iso);
      });
    }

    // Extract Demand
    const demandMap = new Map<string, number>(); // canonicalName -> required qty

    filteredOrders.forEach((o: any) => {
      const orderProducts = [];
      for (let i = 11; i < o.cells.length; i += 2) {
        const pName = String(o.cells[i]?.value || "").trim();
        const pQty = parseInt(String(o.cells[i + 1]?.value || "1"), 10) || 1;
        if (pName && pName !== "NaN") {
          let cleanName = pName;
          cleanName = cleanName.replace(/Solid Color Formal Pants/ig, 'Ladies Formal Pant')
                               .replace(/Office Black/ig, 'Black')
                               .replace(/Wide Legged Formal Pants/ig, 'Wide Leg Formal Pants');
          cleanName = cleanName.replace(/-\s*(3XL|2XL|XXL|XL|L|M|S|Large|Medium|Small)\s*,\s*([A-Za-z\s]+)$/i, '- $2 / $1');
          cleanName = cleanName.replace(/\s*,\s*(3XL|2XL|XXL|XL|L|M|S|Large|Medium|Small|Kid Size|Kid|[\d-]+\s*Years)$/i, ' / $1');
          cleanName = cleanName.replace(/\bXXXL\b/ig, '3XL').replace(/\bXXL\b/ig, '2XL')
                               .replace(/\bLarge\b/ig, 'L').replace(/\bMedium\b/ig, 'M').replace(/\bSmall\b/ig, 'S')
                               .replace(/\bKid Size\b/ig, 'Kid');
          cleanName = cleanName.replace(/\s+/g, ' ').trim();
          
          orderProducts.push({ rawName: cleanName, qty: pQty });
          const current = demandMap.get(cleanName.toLowerCase()) || 0;
          demandMap.set(cleanName.toLowerCase(), current + pQty);
        }
      }
      o.orderProducts = orderProducts;
    });

    // Fetch Database State
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
    const exactShortageOrders = [];
    for (const o of filteredOrders) {
      const shortageProducts = [];
      for (const item of o.orderProducts) {
        const canonical = aliasMap.get(item.rawName.toLowerCase());
        if (canonical) {
          if (factoryCanonicalIds.has(canonical.id)) {
            shortageProducts.push(item);
          }
        } else {
          if (factoryUnmappedNames.has(item.rawName.toLowerCase())) {
            shortageProducts.push(item);
          }
        }
      }
      
      if (shortageProducts.length > 0) {
        // Deep copy the order object, replace orderProducts, and strip heavy cells array to save payload size
        exactShortageOrders.push({
           colA: o.colA,
           colB: o.colB,
           colC: o.colC,
           colD: o.colD,
           colE: o.colE,
           colF: o.colF,
           orderProducts: shortageProducts
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: {
        availableFilters: Array.from(availableFilters).sort(),
        orders: exactShortageOrders,
        factoryList
      } 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
