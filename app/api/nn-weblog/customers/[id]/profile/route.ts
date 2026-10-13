import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureWeblogTables } from "@/lib/weblog/init-db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureWeblogTables();
    const { id } = await params;
    const body = await request.json();

    const existingCustomer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!existingCustomer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const {
      name,
      phone,
      profile_note,
      addresses,
      alternate_phones,
    } = body;

    const dataToUpdate: Record<string, unknown> = {};

    if (typeof name === "string") {
      dataToUpdate.name = name.trim();
    }

    if (typeof phone === "string" && phone.trim()) {
      const cleanPhone = phone.trim().replace(/['`]/g, "");
      // Check if phone is already taken by another customer
      if (cleanPhone !== existingCustomer.phone) {
        const phoneOwner = await prisma.customer.findUnique({
          where: { phone: cleanPhone },
        });
        if (phoneOwner && phoneOwner.id !== id) {
          return NextResponse.json(
            { error: `Phone number ${cleanPhone} is already registered to another customer` },
            { status: 400 }
          );
        }
        dataToUpdate.phone = cleanPhone;
      }
    }

    if (profile_note !== undefined) {
      dataToUpdate.profile_note = typeof profile_note === "string" ? profile_note.trim() : null;
    }

    if (Array.isArray(addresses)) {
      dataToUpdate.addresses = Array.from(new Set(addresses.map((a: string) => String(a).trim()).filter(Boolean)));
    }

    if (Array.isArray(alternate_phones)) {
      dataToUpdate.alternate_phones = Array.from(new Set(alternate_phones.map((p: string) => String(p).trim()).filter(Boolean)));
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({
      success: true,
      customer: updatedCustomer,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update customer profile";
    console.error("Customer profile update error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
