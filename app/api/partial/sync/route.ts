import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const redirectUrl = new URL('/api/partial?sync=true', url.origin);
    const res = await fetch(redirectUrl.toString(), {
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
