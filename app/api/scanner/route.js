import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import path from 'path';

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, rowIndex, rowIndices } = body;

    const auth = new google.auth.GoogleAuth({
  // If the Vercel variables exist, use them. 
  // (The .replace is necessary because Vercel sometimes messes up the line breaks in the key)
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY 
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined,
  },
  // If the variables don't exist (like on your laptop), it will try the file as a backup
  keyFile: process.env.GOOGLE_PRIVATE_KEY ? undefined : "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

    const sheets = google.sheets({ version: 'v4', auth });
    const SPREADSHEET_ID = '1onvRBeDzZ63vwSCONjA2bpD7X10Npd94KuicJxQpRo4';
    const SHEET_TAB_NAME = 'Today'; // Adjust this if your tab is named differently

    // 1. Dynamically find the correct sheetId
    const metaData = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const targetSheet = metaData.data.sheets.find(
      s => s.properties.title.toLowerCase() === SHEET_TAB_NAME.toLowerCase()
    );

    if (!targetSheet) {
      throw new Error(`Could not find a tab named "${SHEET_TAB_NAME}" in your Google Sheet.`);
    }
    
    const ACTUAL_SHEET_ID = targetSheet.properties.sheetId;

    // 2. Process Actions
    if (action === "color") {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            updateCells: {
              range: {
                sheetId: ACTUAL_SHEET_ID, 
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 0,
                endColumnIndex: 26 
              },
              rows: [{
                values: Array(26).fill({
                  userEnteredFormat: { backgroundColor: { red: 0.0, green: 1.0, blue: 1.0 } }
                })
              }],
              fields: "userEnteredFormat.backgroundColor"
            }
          }]
        }
      });
      return NextResponse.json({ success: true });
    } 
    
    // NEW: Apply Strikethrough instead of deleting
    else if (action === "strikethrough") {
      const strikethroughRequests = rowIndices.map(index => ({
        updateCells: {
          range: {
            sheetId: ACTUAL_SHEET_ID,
            startRowIndex: index,
            endRowIndex: index + 1,
            startColumnIndex: 0,
            endColumnIndex: 26
          },
          rows: [{
            values: Array(26).fill({
              userEnteredFormat: { textFormat: { strikethrough: true } }
            })
          }],
          fields: "userEnteredFormat.textFormat.strikethrough"
        }
      }));

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: strikethroughRequests }
      });
      return NextResponse.json({ success: true });
    }
    
    // Deletes rows permanently (used only by the Cyan delete button)
    else if (action === "delete") {
      const sortedIndices = [...rowIndices].sort((a, b) => b - a);
      const deleteRequests = sortedIndices.map(index => ({
        deleteDimension: {
          range: {
            sheetId: ACTUAL_SHEET_ID,
            dimension: "ROWS",
            startIndex: index,
            endIndex: index + 1
          }
        }
      }));

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: deleteRequests }
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });

  } catch (error) {
    console.error("Scanner API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}