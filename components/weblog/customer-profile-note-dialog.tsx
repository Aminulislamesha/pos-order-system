"use client";

import React, { useState } from "react";
import { StickyNote, Edit3, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CustomerProfileNoteDialogProps {
  customerId: string;
  customerName: string;
  initialNote?: string | null;
}

export function CustomerProfileNoteDialog({
  customerId,
  customerName,
  initialNote,
}: CustomerProfileNoteDialogProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initialNote || "");
  const [savedNote, setSavedNote] = useState(initialNote || "");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/nn-weblog/customers/${customerId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_note: note }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile note");
      }

      setSavedNote(note);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        setOpen(false);
      }, 700);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error saving note");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {savedNote ? (
        <button
          onClick={() => {
            setNote(savedNote);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors border border-amber-200/70 dark:border-amber-800/60 max-w-[140px] truncate cursor-pointer text-left"
          title={`Profile Note: ${savedNote}\nClick to view/edit`}
        >
          <StickyNote className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="truncate">{savedNote}</span>
        </button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setNote("");
            setOpen(true);
          }}
          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 gap-1 cursor-pointer"
        >
          <StickyNote className="h-3 w-3" />
          <span>+ Note</span>
        </Button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-amber-500" />
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  Customer Profile Note
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3">
              <p className="text-xs text-slate-500 mb-2">
                Internal profile note for{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {customerName}
                </span>
                . This note belongs to the customer&apos;s account, independent of order notes.
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write customer preferences, special instructions, VIP status..."
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 resize-none"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={isSaving}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : savedSuccess ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-300" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Save Profile Note</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
