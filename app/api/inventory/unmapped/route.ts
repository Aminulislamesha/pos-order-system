export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { matchAliasToProduct } from '@/lib/aliasMatcher';

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
      fields: 'sheets.data.rowData.values(userEnteredValue)'
    });

    const rows = response.data.sheets?.[0]?.data?.[0]?.rowData || [];
    const uniqueRawNames = new Set<string>();

    rows.forEach(row => {
      if (!row.values) return;
      // Products start at column L (index 11) and alternate with quantities
      for (let i = 11; i < row.values.length; i += 2) {
        const cell = row.values[i];
        const productName = cell?.userEnteredValue?.stringValue || cell?.userEnteredValue?.numberValue;
        if (productName && String(productName).trim() !== "" && String(productName) !== "NaN") {
          uniqueRawNames.add(String(productName).trim());
        }
      }
    });

    const rawNames = Array.from(uniqueRawNames);

    // Fetch all known products and aliases
    const products = await prisma.product.findMany({ select: { id: true, name: true } });
    const aliases = await prisma.productAlias.findMany({ select: { alias: true } });

    const knownNames = new Set([
      ...products.map(p => p.name.toLowerCase()),
      ...aliases.map(a => a.alias.toLowerCase())
    ]);

    const finalUnmapped: string[] = [];

    // Check each raw name
    for (const rawName of rawNames) {
      if (knownNames.has(rawName.toLowerCase())) {
        continue; // Already mapped
      }

      // Try auto-mapping using smart alias rules
      const matchedProductId = matchAliasToProduct(rawName, products);

      if (matchedProductId) {
        // We found a smart match! Create the alias automatically
        await prisma.productAlias.create({
          data: {
            alias: rawName,
            productId: matchedProductId
          }
        });
        knownNames.add(rawName.toLowerCase());
      } else {
        // No match found - auto-create as a NEW Canonical Product
        const newProduct = await prisma.product.create({
          data: {
            name: rawName,
            type: 'PRODUCT' // Default to PRODUCT, user can always change or delete later if needed
          }
        });
        
        knownNames.add(rawName.toLowerCase());
        
        // CRITICAL: Add the newly created product to the local `products` array.
        // This ensures that if the loop encounters another unmapped item with the 
        // same signature later on, `matchAliasToProduct` will find THIS new product and make it an alias!
        products.push({ id: newProduct.id, name: newProduct.name });
      }
    }

    return NextResponse.json({ success: true, data: finalUnmapped });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
