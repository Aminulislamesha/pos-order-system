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
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: '1onvRBeDzZ63vwSCONjA2bpD7X10Npd94KuicJxQpRo4',
      range: 'Today!A:ZZ', 
    });

    const rows = response.data.values || [];
    const uniqueRawNames = new Set<string>();

    rows.forEach((row: any[]) => {
      if (!row) return;
      // Products start at column L (index 11) and alternate with quantities
      for (let i = 11; i < row.length; i += 2) {
        const productName = row[i];
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

    for (const rawName of rawNames) {
      if (knownMappings.has(rawName.toLowerCase())) {
        continue;
      }

      // Try parsing with granular alias dictionary
      const rawLower = rawName.toLowerCase();
      let matchedBase: string | null = null;
      let matchedColor: string | null = null;
      let matchedSize: string | null = null;

      let matchedBaseObj: any = null;

      // Match Base
      for (const f of flatBases) {
        if (rawLower.includes(f.variant)) {
          matchedBase = f.canonical;
          matchedBaseObj = f;
          break;
        }
      }

      // Match Color
      for (const f of flatColors) {
        // If the base product has a strict color order, only match colors valid for this base product
        if (matchedBaseObj && matchedBaseObj.colorOrder && matchedBaseObj.colorOrder.length > 0) {
          if (!matchedBaseObj.colorOrder.includes(f.canonical)) continue;
        }

        if (rawLower.includes(f.variant)) {
          matchedColor = f.canonical;
          break;
        }
      }

      // Match Size
      // To prevent 'L' matching inside 'Formal', we use regex for word boundaries for sizes
      for (const f of flatSizes) {
        // If the base product has a strict size order, only match sizes valid for this base product
        if (matchedBaseObj && matchedBaseObj.sizeOrder && matchedBaseObj.sizeOrder.length > 0) {
          if (!matchedBaseObj.sizeOrder.includes(f.canonical)) continue;
        }

        // Escape special regex characters in the variant just in case (e.g., if variant has parentheses)
        const safeVariant = f.variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${safeVariant}\\b`, 'i').test(rawLower)) {
          matchedSize = f.canonical;
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
