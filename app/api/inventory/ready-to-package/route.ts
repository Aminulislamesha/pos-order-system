export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const excludeParam = url.searchParams.get('exclude');
    const excludedOrderIds = excludeParam ? excludeParam.split(',').map((id: any) => id.trim()) : [];
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
      ranges: ['Today!A:ZZ'], 
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

    // Extract products per order
    allOrders.forEach((o: any) => {
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
        }
      }
      o.orderProducts = orderProducts;
    });

    // 2. Dynamic Priority Setup and Sorting
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', day: 'numeric' });
    const today = new Date();
    const todayNum = parseInt(formatter.format(today), 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowNum = parseInt(formatter.format(tomorrow), 10);

    const validPriorities = [`VU${todayNum}`, `VU${tomorrowNum}`, `D${todayNum}`];

    const isUrgent = (colC: string) => {
      const val = String(colC).toUpperCase();
      return validPriorities.some(vp => val.includes(vp));
    };

    allOrders.sort((a: any, b: any) => {
      const aUrgent = isUrgent(a.colC);
      const bUrgent = isUrgent(b.colC);
      
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      
      // If same urgency, sort chronologically by order place date (Column A)
      const aScore = Number(a.rawDateScore) || a.originalRowIndex;
      const bScore = Number(b.rawDateScore) || b.originalRowIndex;
      return aScore - bScore;
    });

    // 3. Fetch Database State
    const products = await prisma.product.findMany({
      include: {
        aliases: true,
        inventory: {
          include: { location: true },
          orderBy: { quantity: 'desc' } // Auto-routing prefers highest stock first
        }
      }
    });

    // Build Alias Map: raw string (lowercase) -> Canonical Product
    const aliasMap = new Map<string, any>();
    const inventoryPool = new Map<string, { total: number, locs: any[] }>();
    products.forEach((p: any) => {
      aliasMap.set(p.name.toLowerCase(), p);
      p.aliases.forEach((a: any) => aliasMap.set(a.alias.toLowerCase(), p));
    });

    // Build running inventory pool
    products.forEach((p: any) => {
      const total = p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
      const locs = p.inventory.map((inv: any) => ({ ...inv })); // shallow copy so we can mutate
      inventoryPool.set(p.id, { total, locs });
    });

    // 4. Simulate Deduction per Order with Advanced VIP Reservation
    const readyToPackage = [];

    for (const order of allOrders) {
      if (!order) continue;
      if (order.orderProducts.length === 0) continue;

      const orderIsPriority = isUrgent(order.colC);
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

    return NextResponse.json({ success: true, data: readyToPackage });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
