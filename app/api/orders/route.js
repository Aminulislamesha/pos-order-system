import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(process.cwd(), 'credentials.json'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId: '1onvRBeDzZ63vwSCONjA2bpD7X10Npd94KuicJxQpRo4',
      ranges: ['Today!A:Z'], // Make sure this matches your tab name
      includeGridData: true,
      fields: 'sheets.data.rowData.values(userEnteredValue,effectiveFormat(backgroundColor,textFormat),note)'
    });

    const rows = response.data.sheets[0]?.data[0]?.rowData || [];

    const formattedOrders = rows.map((row, rowIndex) => {
      if (!row.values) return null;

      const cells = row.values.map(cell => {
        const value = cell.userEnteredValue?.stringValue || cell.userEnteredValue?.numberValue || "";
        const bgColor = cell.effectiveFormat?.backgroundColor;
        const fgColor = cell.effectiveFormat?.textFormat?.foregroundColor;
        
        // NEW: Grab the strikethrough status (true or false)
        const isStrikethrough = cell.effectiveFormat?.textFormat?.strikethrough || false;
        
        const toCSSColor = (colorObj) => {
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
          strikethrough: isStrikethrough, // Pass it to the frontend
          note: cell.note || null
        };
      });

      return {
        originalRowIndex: rowIndex, 
        colA: cells[0]?.value || "", 
        colB: cells[1]?.value || "", 
        colC: cells[2]?.value || "", 
        cells: cells 
      };
    }).filter(row => row && (row.colA !== "" || row.colB !== "")); 

    return NextResponse.json({ success: true, data: formattedOrders });

  } catch (error) {
    console.error("Google Sheets API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}