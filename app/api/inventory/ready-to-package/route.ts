export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { getDictionaries, parseProductName } from '@/lib/productParser';

const formatShortDate = (dateStr: string) => {
  if (!dateStr || String(dateStr).trim() === "") return "";
  const asNumber = Number(dateStr);
  if (!isNaN(asNumber) && asNumber > 40000) {
     const date = new Date(Math.round((asNumber - 25569) * 86400 * 1000));
     return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  const cleanStr = String(dateStr).replace(/at\s+/i, '');
  const parsed = new Date(cleanStr);
  if (isNaN(parsed.getTime())) return String(dateStr);
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const extractTag = (colC: string) => {
  const match = colC.trim().match(/^(VU\d*|D\d*)/i);
  return match ? match[1].toUpperCase() : "";
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const excludeParam = url.searchParams.get('exclude');
    const tagsParam = url.searchParams.get('tags');
    const datesParam = url.searchParams.get('dates');
    
    const excludedOrderIds = excludeParam ? excludeParam.split(',').map((id: any) => id.trim()) : [];
    const selectedTags = tagsParam ? tagsParam.split(',').map(t => t.trim().toLowerCase()) : [];
    const selectedDates = datesParam ? datesParam.split(',').map(d => d.trim().toLowerCase()) : [];
    // 1. Fetch Google Sheets Orders (Same logic as api/orders)
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

    // Parse and format orders
    let allOrders: any[] = rows.map((row: any, rowIndex: number) => {
      if (!row.values) return null;
      const cells = row.values.map((cell: any) => {
        const value = cell.formattedValue || cell.userEnteredValue?.stringValue || cell.userEnteredValue?.numberValue || "";
        const isStrikethrough = cell.effectiveFormat?.textFormat?.strikethrough || false;
        const bg = cell.effectiveFormat?.backgroundColor;
        const isCyan = bg && bg.red === 0 && Math.abs((bg.green || 0) - 1) < 0.1 && Math.abs((bg.blue || 0) - 1) < 0.1;
        return { value: String(value), strikethrough: isStrikethrough, isCyan };
      });

      return {
        originalRowIndex: rowIndex,
        colA: cells[0]?.value || "", // Date (serial or formatted)
        colB: cells[1]?.value || "", // Order ID
        colC: cells[2]?.value || "", // Status / Dispatch (VU, D, etc)
        // Store the raw numeric value for perfect chronological sorting if available
        rawDateScore: row.values[0]?.userEnteredValue?.numberValue || row.values[0]?.userEnteredValue?.stringValue || cells[0]?.value || rowIndex,
        cells
      };
    }).filter((row: any) => row && (row.colA !== "" || row.colB !== ""));

    // Filter out cancelled orders, already packed
    // Note: manually excluded orders are NOT filtered here, they are bypassed in stock allocation instead
    allOrders = allOrders.filter((o: any) => {
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
        return false;
      }

      // INCLUSION RULES
      if (orderId.toUpperCase().startsWith('SC')) {
        return true;
      } else if (orderId.toUpperCase().startsWith('NN')) {
        // Updated to include all the variations the user requested
        const hasValidTag = /\b(C|M|WA|confirmed|confirm|confirm form message|confirm from wa|confirm from whatsapp|confirm from M)\b/i.test(colC);
        const hasValidSuffix = /-exe$/i.test(orderId) || /-exchange$/i.test(orderId);
        if (hasValidTag || hasValidSuffix) {
          return true;
        }
      }

      return false;
    });

    // Extract unique available Tags and Dates for the UI selector
    const availableTags = new Set<string>();
    const availableDates = new Set<string>();

    allOrders.forEach(o => {
      const colC = String(o.colC).trim();
      const colA = String(o.colA).trim();
      
      const tag = extractTag(colC);
      if (tag) {
        availableTags.add(tag);
      }
      
      if (colA) {
        availableDates.add(formatShortDate(colA));
      }
    });

    // Apply the user's dynamic filters
    // If no tags and no dates are selected, the user wants NO orders to be reserved.
    if (selectedTags.length === 0 && selectedDates.length === 0) {
      return NextResponse.json({ 
        success: true, 
        data: [], 
        availableTags: Array.from(availableTags).sort(), 
        availableDates: Array.from(availableDates).sort() 
      });
    }

    allOrders = allOrders.filter(o => {
      const extractedTagLower = extractTag(String(o.colC)).toLowerCase();
      const colAFormattedLower = formatShortDate(o.colA).toLowerCase();
      
      const matchesTag = extractedTagLower !== "" && selectedTags.includes(extractedTagLower);
      const matchesDate = selectedDates.includes(colAFormattedLower);
      
      // We only process orders that match the selected targets
      return matchesTag || matchesDate;
    });

    // Extract products per order
    const demandMap = new Map<string, number>();

    const { flatBases, flatColors, flatSizes } = await getDictionaries();

    // Fetch Database State
    const products = await prisma.product.findMany({
      include: {
        aliases: true,
        inventory: {
          include: { location: true },
          orderBy: { quantity: 'desc' } // Auto-routing prefers highest stock first
        }
      }
    });

    const inventoryPool = new Map<string, { total: number, locs: any[] }>();
    const aliasMap = new Map<string, any>();

    products.forEach((p: any) => {
      aliasMap.set(p.name.toLowerCase(), p);
      p.aliases.forEach((a: any) => aliasMap.set(a.alias.toLowerCase(), p));
      
      const total = p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
      const locs = p.inventory.map((inv: any) => ({ ...inv })); // shallow copy so we can mutate
      inventoryPool.set(p.id, { total, locs });
    });

    allOrders.forEach((o: any) => {
      const orderProducts = [];
      for (let i = 11; i < o.cells.length; i += 2) {
        const pName = String(o.cells[i]?.value || "").trim();
        const pQty = parseInt(String(o.cells[i + 1]?.value || "1"), 10) || 1;
        
        if (pName && pName !== "NaN") {
          const rawLower = pName.toLowerCase();
          
          let resolvedCanonicalName = pName;

          if (aliasMap.has(rawLower)) {
            resolvedCanonicalName = aliasMap.get(rawLower).name;
          } else {
            const parsed = parseProductName(pName, flatBases, flatColors, flatSizes);
            if (parsed.success && parsed.canonicalName) {
              resolvedCanonicalName = parsed.canonicalName;
            }
          }

          orderProducts.push({ rawName: resolvedCanonicalName, qty: pQty });
          const current = demandMap.get(resolvedCanonicalName.toLowerCase()) || 0;
          demandMap.set(resolvedCanonicalName.toLowerCase(), current + pQty);
        }
      }
      o.orderProducts = orderProducts;
    });

    // 2. Dynamic Priority Setup and Sorting
    allOrders.sort((a: any, b: any) => {
      const aTagLower = extractTag(String(a.colC)).toLowerCase();
      const aColALower = formatShortDate(a.colA).toLowerCase();
      const bTagLower = extractTag(String(b.colC)).toLowerCase();
      const bColALower = formatShortDate(b.colA).toLowerCase();

      const aIsTagPriority = aTagLower !== "" && selectedTags.includes(aTagLower);
      const bIsTagPriority = bTagLower !== "" && selectedTags.includes(bTagLower);
      
      // Group 1: Matches selected Tags. Group 2: Matches selected Dates
      if (aIsTagPriority && !bIsTagPriority) return -1;
      if (!aIsTagPriority && bIsTagPriority) return 1;
      
      // If they are in the same priority group, sort chronologically
      const aScore = Number(a.rawDateScore) || a.originalRowIndex;
      const bScore = Number(b.rawDateScore) || b.originalRowIndex;
      return aScore - bScore;
    });

    // (Database state already fetched and processed above)

    // 4. Simulate Deduction per Order with Advanced VIP Reservation
    const readyToPackage = [];

    for (const order of allOrders) {
      if (!order) continue;
      if (order.orderProducts.length === 0) continue;

      // Because we filtered `allOrders`, ALL remaining orders act as Priority/VIP
      // allowing partial fulfillment and tracking shortages dynamically
      const orderIsPriority = true;
      let orderFullyFulfillable = true;
      const orderAllocations = [];
      let mappedEverything = true;

      // First pass: Check if all products map to canonicals
      for (const item of order.orderProducts) {
        const canonical = aliasMap.get(item.rawName.toLowerCase());
        if (!canonical) {
          mappedEverything = false;
          break;
        }
      }
      
      if (!mappedEverything) {
        // If an order has unmapped products, it skips everything.
        continue;
      }
      
      const isHidden = excludedOrderIds.includes(order.colB);
      
      if (isHidden) {
        // Bypass stock allocation completely for hidden orders, but include them in the view
        const bypassedAllocations = order.orderProducts.map((item: any) => {
          const canonical = aliasMap.get(item.rawName.toLowerCase());
          return {
            rawName: item.rawName,
            canonicalProduct: canonical ? { id: canonical.id, name: canonical.name } : null,
            requestedQty: item.qty,
            allocatedQty: 0,
            shortage: item.qty,
            allocations: []
          };
        });
        
        readyToPackage.push({
          orderId: order.colB,
          date: order.colA,
          status: order.colC,
          originalRowIndex: order.originalRowIndex,
          items: bypassedAllocations,
          isFulfillable: false,
          isHidden: true,
          cells: order.cells,
          isPriority: orderIsPriority
        });
        continue;
      }

      // Check all products in this order and pull stock
      for (const item of order.orderProducts) {
        const canonical = aliasMap.get(item.rawName.toLowerCase());
        const pool = inventoryPool.get(canonical.id)!;
        
        // If priority, take whatever is available. If normal, only take if 100% available.
        // Wait, for normal, we need to know if the ENTIRE order is 100% available before deducting.
        // For priority, we aggressively deduct immediately.
        // We will separate the logic for VIP vs Normal.
      }
      
      if (orderIsPriority) {
        // VIP LOGIC: Reserve partials immediately
        for (const item of order.orderProducts) {
          const canonical = aliasMap.get(item.rawName.toLowerCase());
          const pool = inventoryPool.get(canonical.id)!;
          
          let qtyRemainingToDeduct = item.qty;
          let qtyAllocated = 0;
          const tempLocAllocations = [];
          
          for (const loc of pool.locs) {
            if (qtyRemainingToDeduct <= 0) break;
            if (loc.quantity > 0) {
              const take = Math.min(loc.quantity, qtyRemainingToDeduct);
              tempLocAllocations.push({
                locationId: loc.locationId,
                locationName: loc.location.name,
                qty: take
              });
              qtyRemainingToDeduct -= take;
              qtyAllocated += take;
              
              // Physically reserve from running pool
              loc.quantity -= take;
            }
          }
          
          pool.total -= qtyAllocated;

          if (qtyAllocated < item.qty) {
            orderFullyFulfillable = false;
          }

          orderAllocations.push({
            rawName: item.rawName,
            canonicalProduct: { id: canonical.id, name: canonical.name },
            requestedQty: item.qty,
            allocatedQty: qtyAllocated,
            shortage: item.qty - qtyAllocated,
            allocations: tempLocAllocations
          });
        }
        
        // Push to view regardless of fulfillable status, because it's a VIP holding reservations
        readyToPackage.push({
          orderId: order.colB,
          date: order.colA,
          status: order.colC,
          originalRowIndex: order.originalRowIndex,
          items: orderAllocations,
          isFulfillable: orderFullyFulfillable,
          cells: order.cells,
          isPriority: true
        });

      } else {
        // NORMAL LOGIC: Only fulfill if 100% of the entire order is available
        // Pre-check all items without mutating the pool
        let normalCanFulfill = true;
        for (const item of order.orderProducts) {
          const canonical = aliasMap.get(item.rawName.toLowerCase());
          const pool = inventoryPool.get(canonical.id)!;
          if (pool.total < item.qty) {
            normalCanFulfill = false;
            break;
          }
        }
        
        if (normalCanFulfill) {
          // It CAN be fulfilled. Mutate the pool and generate allocations.
          for (const item of order.orderProducts) {
            const canonical = aliasMap.get(item.rawName.toLowerCase());
            const pool = inventoryPool.get(canonical.id)!;
            
            let qtyRemainingToDeduct = item.qty;
            const tempLocAllocations = [];
            
            for (const loc of pool.locs) {
              if (qtyRemainingToDeduct <= 0) break;
              if (loc.quantity > 0) {
                const take = Math.min(loc.quantity, qtyRemainingToDeduct);
                tempLocAllocations.push({
                  locationId: loc.locationId,
                  locationName: loc.location.name,
                  qty: take
                });
                qtyRemainingToDeduct -= take;
                loc.quantity -= take;
              }
            }
            
            pool.total -= item.qty;
            
            orderAllocations.push({
              rawName: item.rawName,
              canonicalProduct: { id: canonical.id, name: canonical.name },
              requestedQty: item.qty,
              allocatedQty: item.qty,
              shortage: 0,
              allocations: tempLocAllocations
            });
          }
          
          readyToPackage.push({
            orderId: order.colB,
            date: order.colA,
            status: order.colC,
            originalRowIndex: order.originalRowIndex,
            items: orderAllocations,
            isFulfillable: true,
            cells: order.cells,
            isPriority: false
          });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: readyToPackage,
      availableTags: Array.from(availableTags).sort(),
      availableDates: Array.from(availableDates).sort()
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
