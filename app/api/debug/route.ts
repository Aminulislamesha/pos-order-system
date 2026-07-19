import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function GET() {
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
  const SPREADSHEET_ID = '1onvRBeDzZ63vwSCONjA2bpD7X10Npd94KuicJxQpRo4';

  const startAZ = Date.now();
  const resAZ = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    ranges: ['Today!A:AZ'],
    includeGridData: true,
    fields: 'sheets.data.rowData.values(userEnteredValue,formattedValue,effectiveFormat(backgroundColor,textFormat),note)'
  });
  const timeAZ = Date.now() - startAZ;

  const startZZ = Date.now();
  const resZZ = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    ranges: ['Today!A:ZZ'],
    includeGridData: true,
    fields: 'sheets.data.rowData.values(userEnteredValue,formattedValue,effectiveFormat(backgroundColor,textFormat),note)'
  });
  const timeZZ = Date.now() - startZZ;

  return NextResponse.json({
    timeAZMs: timeAZ,
    timeZZMs: timeZZ
  });
}
