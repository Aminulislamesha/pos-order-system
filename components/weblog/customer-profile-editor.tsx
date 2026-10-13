"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Phone,
  MapPin,
  StickyNote,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CustomerProfileEditorProps {
  customer: {
    id: string;
    name: string;
    phone: string;
    profile_note?: string | null;
    addresses?: string[];
    alternate_phones?: string[];
  };
}

export function CustomerProfileEditor({ customer }: CustomerProfileEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [profileNote, setProfileNote] = useState(customer.profile_note || "");
  const [addresses, setAddresses] = useState<string[]>(customer.addresses || []);
  const [alternatePhones, setAlternatePhones] = useState<string[]>(customer.alternate_phones || []);

  // New item inputs
  const [newAddress, setNewAddress] = useState("");
  const [newAltPhone, setNewAltPhone] = useState("");

  const handleAddAddress = () => {
    if (!newAddress.trim()) return;
    if (!addresses.includes(newAddress.trim())) {
      setAddresses([...addresses, newAddress.trim()]);
    }
    setNewAddress("");
  };

  const handleRemoveAddress = (index: number) => {
    setAddresses(addresses.filter((_, i) => i !== index));
  };

  const handleAddAltPhone = () => {
    if (!newAltPhone.trim()) return;
    const clean = newAltPhone.trim().replace(/['`]/g, "");
    if (!alternatePhones.includes(clean)) {
      setAlternatePhones([...alternatePhones, clean]);
    }
    setNewAltPhone("");
  };

  const handleRemoveAltPhone = (index: number) => {
    setAlternatePhones(alternatePhones.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
    setName(customer.name);
    setPhone(customer.phone);
    setProfileNote(customer.profile_note || "");
    setAddresses(customer.addresses || []);
    setAlternatePhones(customer.alternate_phones || []);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/nn-weblog/customers/${customer.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          profile_note: profileNote.trim() || null,
          addresses,
          alternate_phones: alternatePhones,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update profile");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error saving profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <User className="h-4 w-4 text-blue-500" />
            <span>Customer Profile &amp; Contact Info</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Editable profile details independent of individual order history records.
          </p>
        </div>

        {!isEditing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-1.5 text-xs h-8"
          >
            <Edit2 className="h-3 w-3" />
            <span>Edit Profile</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-1.5 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {!isEditing ? (
        /* Read-Only View */
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          {/* Left Column: Core Info & Note */}
          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold uppercase text-slate-400">Full Name</span>
              <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{customer.name}</p>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase text-slate-400">Primary Phone</span>
              <p className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
                {customer.phone}
              </p>
            </div>

            {alternatePhones.length > 0 && (
              <div>
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Alternate Phone Numbers ({alternatePhones.length})
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {alternatePhones.map((p, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <Phone className="h-3 w-3 text-slate-400" />
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1">
                <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                Profile Note
              </span>
              {customer.profile_note ? (
                <div className="mt-1.5 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 whitespace-pre-wrap">
                  {customer.profile_note}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400 italic">No profile note added.</p>
              )}
            </div>
          </div>

          {/* Right Column: Addresses */}
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-blue-500" />
              Saved Addresses ({addresses.length})
            </span>
            {addresses.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400 italic">No addresses saved on profile.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {addresses.map((addr, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
                  >
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300 shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="leading-relaxed">{addr}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Edit Mode */
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-blue-500" />
            <span>
              Updating profile data will not modify previous order addresses or details.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Customer Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Primary Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Profile Note (Preferences, VIP tags, internal instructions)
            </label>
            <textarea
              value={profileNote}
              onChange={(e) => setProfileNote(e.target.value)}
              placeholder="e.g. Pre-paid only, prefer delivery after 4 PM, requested palazzo sample..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Alternate Phones Section */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Alternate Phone Numbers
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {alternatePhones.map((p, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <span>{p}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAltPhone(idx)}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="text"
                value={newAltPhone}
                onChange={(e) => setNewAltPhone(e.target.value)}
                placeholder="Add alternate phone (01...)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddAltPhone();
                  }
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddAltPhone}
                className="h-8 text-xs gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </div>

          {/* Saved Addresses Section */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Saved Shipping Addresses
            </label>
            <div className="space-y-2 mb-2">
              {addresses.map((addr, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <span className="flex-1 text-slate-800 dark:text-slate-200">{addr}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAddress(idx)}
                    className="text-slate-400 hover:text-rose-500 p-1"
                    title="Remove address"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Add new shipping address..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddAddress();
                  }
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddAddress}
                className="h-8 text-xs gap-1"
              >
                <Plus className="h-3 w-3" /> Add Address
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
