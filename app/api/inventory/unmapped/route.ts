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
      ranges: ['Today!A:ZZ'], 
      includeGridData: true,
      fields: 'sheets.data.rowData.values(userEnteredValue)'
    });

    const rows = response.data.sheets?.[0]?.data?.[0]?.rowData || [];
    const uniqueRawNames = new Set<string>();

    rows.forEach((row: any) => {
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

    // Fetch all mappings
    const products = await prisma.product.findMany({ select: { id: true, name: true } });
    const productAliases = await prisma.productAlias.findMany({ select: { alias: true } });

    const knownMappings = new Set([
      ...products.map((p: any) => p.name.toLowerCase()),
      ...productAliases.map((a: any) => a.alias.toLowerCase())
    ]);

    const finalUnmapped: string[] = [];

    // Fetch dictionaries
    const bases = await prisma.baseProduct.findMany();
    const colors = await prisma.color.findMany();
    const sizes = await prisma.size.findMany();

    for (const rawName of rawNames) {
      if (knownMappings.has(rawName.toLowerCase())) {
        continue;
      }

      // Try parsing with granular alias dictionary
      const rawLower = rawName.toLowerCase();
      let matchedBase: string | null = null;
      let matchedColor: string | null = null;
      let matchedSize: string | null = null;

      // Match Base
      for (const b of bases) {
        const variants = [b.name, ...b.aliases].map(v => v.toLowerCase());
        if (variants.some(v => rawLower.includes(v))) {
          matchedBase = b.name;
          break;
        }
      }

      // Match Color
      for (const c of colors) {
        const variants = [c.name, ...c.aliases].map(v => v.toLowerCase());
        // Simple word boundary match or partial match could work, but for safety:
        if (variants.some(v => rawLower.includes(v))) {
          matchedColor = c.name;
          break;
        }
      }

      // Match Size
      // To prevent 'L' matching inside 'Formal', we use regex for word boundaries for sizes
      for (const s of sizes) {
        const variants = [s.name, ...s.aliases].map(v => v.toLowerCase());
        if (variants.some(v => new RegExp(`\\b${v}\\b`, 'i').test(rawLower))) {
          matchedSize = s.name;
          break;
        }
      }

      if (matchedBase && matchedColor && matchedSize) {
        // Construct canonical name
        const canonicalName = `${matchedBase} - ${matchedColor} / ${matchedSize}`;
        
        let product = products.find(p => p.name === canonicalName);
        if (!product) {
          // Check if it exists with comma separator
          const commaName = `${matchedBase} - ${matchedColor}, ${matchedSize}`;
          product = products.find(p => p.name === commaName);
        }

        if (product) {
          // Standard product exists! Create the alias mapping
          await prisma.productAlias.create({
            data: { alias: rawName, productId: product.id }
          });
          knownMappings.add(rawName.toLowerCase());
        } else {
          // Parsing successful, but canonical product doesn't exist yet!
          // Per user request, DO NOT automatically create it. Treat as unmapped.
          finalUnmapped.push(rawName);
        }
      } else {
        // Parsing failed! Add to unmapped list.
        finalUnmapped.push(rawName);
      }
    }

    return NextResponse.json({ success: true, data: finalUnmapped });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
