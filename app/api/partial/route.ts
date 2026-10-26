import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = '1onvRBeDzZ63vwSCONjA2bpD7X10Npd94KuicJxQpRo4';
const SHEET_TAB_NAME = 'Today';

function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined,
    },
    keyFile: process.env.GOOGLE_PRIVATE_KEY ? undefined : 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function getActualSheetId(sheets: any) {
  const metaData = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const targetSheet = metaData.data.sheets?.find(
    (s: any) => s.properties?.title?.toLowerCase() === SHEET_TAB_NAME.toLowerCase()
  );
  if (!targetSheet) {
    throw new Error(`Could not find a tab named "${SHEET_TAB_NAME}" in your Google Sheet.`);
  }
  return targetSheet.properties?.sheetId;
}

// Helper to find the live 0-based row index for an order ID
async function findLiveRowIndex(sheets: any, orderId: string, fallbackIndex: number) {
  try {
    const colBResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TAB_NAME}!B:B`,
    });
    const rows = colBResponse.data.values || [];
    const liveIndex = rows.findIndex((row: any) => row && String(row[0]).trim() === orderId.trim());
    if (liveIndex !== -1) {
      return liveIndex;
    }
  } catch (err) {
    console.error(`Error looking up live row index for ${orderId}:`, err);
  }
  return fallbackIndex;
}

// Color row in Google Sheet: '#88f7af' (partial) or '#00FFFF' (cyan)
async function colorSheetRow(sheets: any, sheetId: number, rowIndex: number, hexColor: string) {
  let red = 0.0;
  let green = 1.0;
  let blue = 1.0;

  if (hexColor.toLowerCase() === '#88f7af') {
    red = 136 / 255;
    green = 247 / 255;
    blue = 175 / 255;
  } else if (hexColor.toLowerCase() === '#00ffff' || hexColor.toLowerCase() === 'cyan') {
    red = 0.0;
    green = 1.0;
    blue = 1.0;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 26,
            },
            rows: [
              {
                values: Array(26).fill({
                  userEnteredFormat: {
                    backgroundColor: { red, green, blue },
                  },
                }),
              },
            ],
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ],
    },
  });
}

// Helper to calculate the next available serial number (smallest positive integer >= 1)
async function getNextAvailableSerial(excludeOrderId?: string): Promise<number> {
  const activePackages = await prisma.partialPackage.findMany({
    where: {
      isFulfilled: false,
      serialNumber: { not: null },
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
    },
    select: { serialNumber: true },
  });

  const usedSerials = new Set<number>();
  activePackages.forEach((pkg) => {
    if (typeof pkg.serialNumber === 'number') {
      usedSerials.add(pkg.serialNumber);
    }
  });

  let candidate = 1;
  while (usedSerials.has(candidate)) {
    candidate++;
  }
  return candidate;
}

// -------------------------------------------------------------
// GET: Fetch all partial packages, with optional Google Sheet sync
// -------------------------------------------------------------
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const doSync = url.searchParams.get('sync') === 'true';

    let packages = await prisma.partialPackage.findMany({
      orderBy: [{ isFulfilled: 'asc' }, { serialNumber: 'asc' }, { createdAt: 'desc' }],
    });

    if (doSync && packages.length > 0) {
      try {
        const sheets = getGoogleSheetsClient();
        const response = await sheets.spreadsheets.get({
          spreadsheetId: SPREADSHEET_ID,
          ranges: [`${SHEET_TAB_NAME}!A:CZ`],
          includeGridData: true,
          fields:
            'sheets.data.rowData.values(userEnteredValue,formattedValue,effectiveFormat(backgroundColor,textFormat),note)',
        });

        const rows = response.data.sheets?.[0]?.data?.[0]?.rowData || [];

        // Build orderId -> { rowIndex, rowData, isCyan } map from live sheet
        const liveOrdersMap = new Map<string, { rowIndex: number; row: any; isCyan: boolean }>();

        rows.forEach((row: any, rIdx: number) => {
          if (!row.values) return;
          const orderIdCell = row.values[1];
          const orderId = String(
            orderIdCell?.formattedValue || orderIdCell?.userEnteredValue?.stringValue || ''
          ).trim();
          if (!orderId) return;

          // Check if columns H-M (indices 7 to 12) are Cyan
          const isCyan = row.values.slice(7, 13).some((cell: any) => {
            const bg = cell?.effectiveFormat?.backgroundColor;
            return (
              bg &&
              (bg.red || 0) === 0 &&
              Math.abs((bg.green || 0) - 1) < 0.1 &&
              Math.abs((bg.blue || 0) - 1) < 0.1
            );
          });

          liveOrdersMap.set(orderId, { rowIndex: rIdx, row, isCyan });
        });

        // Update DB records where row indices or sheet status changed
        for (const pkg of packages) {
          const liveData = liveOrdersMap.get(pkg.orderId);
          if (liveData) {
            let needsUpdate = false;
            const updatePayload: any = {};

            if (pkg.rowIndex !== liveData.rowIndex) {
              updatePayload.rowIndex = liveData.rowIndex;
              needsUpdate = true;
            }

            // If row in Google Sheet has become Cyan directly, mark fulfilled!
            if (liveData.isCyan && !pkg.isFulfilled) {
              updatePayload.isFulfilled = true;
              updatePayload.fulfilledAt = new Date();
              updatePayload.previousSerial = pkg.serialNumber || pkg.previousSerial;
              updatePayload.serialNumber = null;
              updatePayload.sheetColor = '#00FFFF';
              needsUpdate = true;
            }

            // Sync Col C note
            const colCCell = liveData.row.values?.[2];
            const liveNote = String(
              colCCell?.formattedValue || colCCell?.userEnteredValue?.stringValue || ''
            ).trim();
            if (liveNote && liveNote !== pkg.note) {
              updatePayload.note = liveNote;
              needsUpdate = true;
            }

            // Sync cells data for UI
            const cells = liveData.row.values.map((cell: any) => {
              const value =
                cell?.formattedValue ||
                cell?.userEnteredValue?.stringValue ||
                cell?.userEnteredValue?.numberValue ||
                '';
              const bgColor = cell?.effectiveFormat?.backgroundColor;
              const fgColor = cell?.effectiveFormat?.textFormat?.foregroundColor;
              const isStrikethrough = cell?.effectiveFormat?.textFormat?.strikethrough || false;

              const toCSSColor = (colorObj: any) => {
                if (!colorObj) return 'transparent';
                const r = Math.round((colorObj.red || 0) * 255);
                const g = Math.round((colorObj.green || 0) * 255);
                const b = Math.round((colorObj.blue || 0) * 255);
                return `rgb(${r}, ${g}, ${b})`;
              };

              return {
                value: String(value),
                backgroundColor: toCSSColor(bgColor),
                textColor: toCSSColor(fgColor),
                strikethrough: isStrikethrough,
                note: cell?.note || null,
              };
            });
            updatePayload.rawCells = cells;
            needsUpdate = true;

            if (needsUpdate) {
              await prisma.partialPackage.update({
                where: { id: pkg.id },
                data: updatePayload,
              });
            }
          }
        }

        // Re-fetch updated list after sync
        packages = await prisma.partialPackage.findMany({
          orderBy: [{ isFulfilled: 'asc' }, { serialNumber: 'asc' }, { createdAt: 'desc' }],
        });
      } catch (sheetSyncErr) {
        console.error('Sheet sync non-blocking error:', sheetSyncErr);
      }
    }

    return NextResponse.json({ success: true, data: packages });
  } catch (error: any) {
    console.error('Error fetching partial packages:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// -------------------------------------------------------------
// POST: Create or update a partial package
// -------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderId,
      packedProducts, // [{ name, packedQty }]
      rawProducts,    // [{ name, orderedQty }]
      isFulfilled: explicitFulfilled,
      orderData,      // { rowIndex, colA, colB, colC, colD, colE, colF, cells }
    } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    const cleanOrderId = String(orderId).trim();
    const existing = await prisma.partialPackage.findUnique({
      where: { orderId: cleanOrderId },
    });

    // Check if fully fulfilled:
    // If user passed explicit isFulfilled, respect it; otherwise check if all items packed >= ordered
    let isFulfilled = false;
    if (typeof explicitFulfilled === 'boolean') {
      isFulfilled = explicitFulfilled;
    } else if (rawProducts && Array.isArray(rawProducts) && rawProducts.length > 0) {
      const packedMap = new Map<string, number>();
      if (Array.isArray(packedProducts)) {
        packedProducts.forEach((p: any) => {
          packedMap.set(String(p.name).trim().toLowerCase(), Number(p.packedQty) || 0);
        });
      }
      isFulfilled = rawProducts.every((rp: any) => {
        const ordered = Number(rp.orderedQty) || 1;
        const packed = packedMap.get(String(rp.name).trim().toLowerCase()) || 0;
        return packed >= ordered;
      });
    }

    // Determine serial number
    let serialNumber: number | null = null;
    let previousSerial: number | null = existing?.previousSerial ?? null;

    if (isFulfilled) {
      // Free the active serial number, retain previousSerial for Option A display: "✓ Full (was #2)"
      previousSerial = existing?.serialNumber ?? existing?.previousSerial ?? null;
      serialNumber = null;
    } else {
      // Active partial package: keep existing serial or generate next available
      if (existing && existing.serialNumber && !existing.isFulfilled) {
        serialNumber = existing.serialNumber;
      } else {
        serialNumber = await getNextAvailableSerial(cleanOrderId);
      }
    }

    const sheetColor = isFulfilled ? '#00FFFF' : '#88f7af';

    // Live Sheet Lookup & Row Coloring
    const fallbackRowIndex = orderData?.rowIndex ?? existing?.rowIndex ?? 0;
    try {
      const sheets = getGoogleSheetsClient();
      const actualSheetId = await getActualSheetId(sheets);
      const liveRowIndex = await findLiveRowIndex(sheets, cleanOrderId, fallbackRowIndex);

      // Color the live row
      await colorSheetRow(sheets, actualSheetId, liveRowIndex, sheetColor);

      // Update in database
      const upserted = await prisma.partialPackage.upsert({
        where: { orderId: cleanOrderId },
        create: {
          orderId: cleanOrderId,
          serialNumber,
          previousSerial,
          rowIndex: liveRowIndex,
          date: orderData?.colA ?? existing?.date ?? '',
          note: orderData?.colC ?? existing?.note ?? '',
          customerName: orderData?.colD ?? existing?.customerName ?? '',
          phone: orderData?.colE ?? existing?.phone ?? '',
          address: orderData?.colF ?? existing?.address ?? '',
          rawProducts: rawProducts ?? existing?.rawProducts ?? [],
          packedProducts: packedProducts ?? existing?.packedProducts ?? [],
          isFulfilled,
          fulfilledAt: isFulfilled ? new Date() : null,
          sheetColor,
          rawCells: orderData?.cells ?? existing?.rawCells ?? null,
        },
        update: {
          serialNumber,
          previousSerial,
          rowIndex: liveRowIndex,
          date: orderData?.colA ?? existing?.date,
          note: orderData?.colC ?? existing?.note,
          customerName: orderData?.colD ?? existing?.customerName,
          phone: orderData?.colE ?? existing?.phone,
          address: orderData?.colF ?? existing?.address,
          rawProducts: rawProducts ?? existing?.rawProducts,
          packedProducts: packedProducts ?? existing?.packedProducts,
          isFulfilled,
          fulfilledAt: isFulfilled ? (existing?.fulfilledAt ?? new Date()) : null,
          sheetColor,
          rawCells: orderData?.cells ?? existing?.rawCells,
        },
      });

      return NextResponse.json({ success: true, data: upserted });
    } catch (sheetErr: any) {
      console.error('Google Sheets coloring error in /api/partial:', sheetErr);

      // If Google Sheets fails, still save to DB so user data is never lost
      const upserted = await prisma.partialPackage.upsert({
        where: { orderId: cleanOrderId },
        create: {
          orderId: cleanOrderId,
          serialNumber,
          previousSerial,
          rowIndex: fallbackRowIndex,
          date: orderData?.colA ?? '',
          note: orderData?.colC ?? '',
          customerName: orderData?.colD ?? '',
          phone: orderData?.colE ?? '',
          address: orderData?.colF ?? '',
          rawProducts: rawProducts ?? [],
          packedProducts: packedProducts ?? [],
          isFulfilled,
          fulfilledAt: isFulfilled ? new Date() : null,
          sheetColor,
          rawCells: orderData?.cells ?? null,
        },
        update: {
          serialNumber,
          previousSerial,
          rawProducts: rawProducts ?? existing?.rawProducts,
          packedProducts: packedProducts ?? existing?.packedProducts,
          isFulfilled,
          fulfilledAt: isFulfilled ? (existing?.fulfilledAt ?? new Date()) : null,
          sheetColor,
          rawCells: orderData?.cells ?? existing?.rawCells,
        },
      });

      return NextResponse.json({
        success: true,
        data: upserted,
        warning: 'Saved in database, but Google Sheet color update failed: ' + sheetErr.message,
      });
    }
  } catch (error: any) {
    console.error('Error in POST /api/partial:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// -------------------------------------------------------------
// DELETE: Delete a single package OR clear all fulfilled packages
// -------------------------------------------------------------
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    const action = url.searchParams.get('action');

    if (action === 'clearFulfilled') {
      const result = await prisma.partialPackage.deleteMany({
        where: { isFulfilled: true },
      });
      return NextResponse.json({ success: true, count: result.count });
    }

    if (orderId) {
      await prisma.partialPackage.delete({
        where: { orderId: String(orderId).trim() },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'orderId or action is required' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in DELETE /api/partial:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
