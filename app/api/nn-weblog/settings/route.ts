import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_SETTINGS: Record<string, string> = {
  inactivity_days: "30",
  repeat_customer_days: "30",
  steadfast_auto_sync: "true",
};

export async function GET() {
  try {
    const records = await prisma.settings.findMany();
    const settingsMap = { ...DEFAULT_SETTINGS };

    for (const item of records) {
      settingsMap[item.key] = item.value;
    }

    return NextResponse.json({ settings: settingsMap });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to load settings";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid settings format" }, { status: 400 });
    }

    const updates = Object.entries(settings).map(([key, value]) => {
      const stringValue = String(value);
      return prisma.settings.upsert({
        where: { key },
        update: { value: stringValue },
        create: { key, value: stringValue },
      });
    });

    await prisma.$transaction(updates);

    return NextResponse.json({ success: true, settings });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update settings";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
