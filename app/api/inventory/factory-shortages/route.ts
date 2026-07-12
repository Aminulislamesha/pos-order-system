export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
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
      ranges: ['Today!A:Z'], 
      includeGridData: true,
      fields: 'sheets.data.rowData.values(userEnteredValue,effectiveFormat(textFormat))'
    });

    // Sort by chronological order using the numeric date score
    const rows = response.data.sheets?.[0]?.data?.[0]?.rowData || [];

    // 1. Calculate Urgent Demand
    const urgentDemand = new Map<string, number>();

    rows.forEach((row: any) => {
      if (!row.values) return;
      
      const colB = row.values[1]?.userEnteredValue?.stringValue || row.values[1]?.userEnteredValue?.numberValue || "";
      const colC = row.values[2]?.userEnteredValue?.stringValue || row.values[2]?.userEnteredValue?.numberValue || "";
      const isStrikethrough = row.values[1]?.effectiveFormat?.textFormat?.strikethrough || false;

      if (!colB || isStrikethrough || /cancelled|cancel/i.test(String(colC))) return;

      if (/\b(VU|D)\b/i.test(String(colC))) {
        // It is an urgent order, tally its products
        for (let i = 11; i < row.values.length; i += 2) {
          const pName = String(row.values[i]?.userEnteredValue?.stringValue || row.values[i]?.userEnteredValue?.numberValue || "").trim();
          const pQty = parseInt(String(row.values[i + 1]?.userEnteredValue?.stringValue || row.values[i + 1]?.userEnteredValue?.numberValue || "1"), 10) || 1;
          
          if (pName && pName !== "NaN") {
            const current = urgentDemand.get(pName.toLowerCase()) || 0;
            urgentDemand.set(pName.toLowerCase(), current + pQty);
          }
        }
      }
    });

    // 2. Fetch Live Inventory
    const products = await prisma.product.findMany({
      include: {
        aliases: true,
        inventory: true
      }
    });

    const inventoryPool = new Map<string, number>(); // canonical ID -> total stock
    const aliasMap = new Map<string, string>(); // raw name lowercase -> canonical ID

    products.forEach((p: any) => {
      const total = p.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
      inventoryPool.set(p.id, total);
      aliasMap.set(p.name.toLowerCase(), p.id);
      p.aliases.forEach((a: any) => aliasMap.set(a.alias.toLowerCase(), p.id));
    });

    // 3. Compare Urgent Demand vs Inventory to find Shortages
    const shortages: Record<string, number> = {}; // raw name -> shortage amount

    for (const [rawNameLower, demand] of urgentDemand.entries()) {
      const canonicalId = aliasMap.get(rawNameLower);
      if (!canonicalId) {
        // Unmapped product, technically 0 stock
        shortages[rawNameLower] = demand; 
        continue;
      }

      const currentStock = inventoryPool.get(canonicalId) || 0;
      if (currentStock < demand) {
        shortages[rawNameLower] = demand - currentStock;
      }
      
      // Deduct from pool so we don't double count if multiple raw names map to same canonical
      // (Actually, if multiple raw names map to the same product, we should group demand by canonical ID first)
    }

    // Let's refine step 3: Group demand by Canonical ID
    const canonicalDemand = new Map<string, number>();
    const unmappedDemand = new Map<string, number>();

    for (const [rawNameLower, demand] of urgentDemand.entries()) {
      const canonicalId = aliasMap.get(rawNameLower);
      if (canonicalId) {
        canonicalDemand.set(canonicalId, (canonicalDemand.get(canonicalId) || 0) + demand);
      } else {
        unmappedDemand.set(rawNameLower, (unmappedDemand.get(rawNameLower) || 0) + demand);
      }
    }

    // Final Shortages mapping
    const finalShortages: Record<string, number> = {};

    // For mapped products, compare total canonical demand vs total canonical stock
    for (const [canonicalId, demand] of canonicalDemand.entries()) {
      const currentStock = inventoryPool.get(canonicalId) || 0;
      if (currentStock < demand) {
        // Map the shortage back to the canonical product name so frontend can match it
        const product = products.find(p => p.id === canonicalId);
        if (product) {
          finalShortages[product.name.toLowerCase()] = demand - currentStock;
          // Also map the aliases to the same shortage so frontend can match raw names
          product.aliases.forEach(a => {
            finalShortages[a.alias.toLowerCase()] = demand - currentStock;
          });
        }
      }
    }

    // For unmapped products, shortage is just the demand
    for (const [rawNameLower, demand] of unmappedDemand.entries()) {
      finalShortages[rawNameLower] = demand;
    }

    return NextResponse.json({ success: true, data: finalShortages });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
