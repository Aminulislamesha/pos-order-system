/**
 * Firebase Firestore integration for Steadfast Consignment Notes
 * Project: steadfast-notes
 * Collection: consignments/{consignmentId}
 */

export interface ConsignmentNote {
  id?: string;
  category?: string;
  text?: string;
  created?: number;
}

export async function fetchConsignmentNotesFromFirebase(
  consignmentId: string | number
): Promise<{
  allNotes: ConsignmentNote[];
  primaryCancelNote: string | null;
  latestNote: string | null;
}> {
  if (!consignmentId) {
    return { allNotes: [], primaryCancelNote: null, latestNote: null };
  }

  const cleanCid = String(consignmentId).trim();
  const url = `https://firestore.googleapis.com/v1/projects/steadfast-notes/databases/(default)/documents/consignments/${encodeURIComponent(
    cleanCid
  )}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      // Fast 5s timeout to not slow down page loads
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!res.ok) {
      return { allNotes: [], primaryCancelNote: null, latestNote: null };
    }

    const data = await res.json();
    const rawValues = data?.fields?.notes?.arrayValue?.values || [];

    const notes: ConsignmentNote[] = [];

    for (const val of rawValues) {
      const fields = val?.mapValue?.fields;
      if (!fields) continue;

      const category = fields.category?.stringValue || "";
      const text = fields.text?.stringValue || "";
      const id = fields.id?.stringValue || "";
      const createdStr = fields.created?.integerValue || "";
      const created = createdStr ? parseInt(createdStr, 10) : 0;

      notes.push({ id, category, text, created });
    }

    // Sort newest first
    notes.sort((a, b) => (b.created || 0) - (a.created || 0));

    // 1. Look for cancellation note: starts with "cancel/" or "canceled" or "cancel" in category or text
    let primaryCancelNote: string | null = null;
    for (const n of notes) {
      const combined = `${n.category || ""} ${n.text || ""}`.trim();
      const catLower = (n.category || "").toLowerCase();
      const txtLower = (n.text || "").toLowerCase();

      if (
        catLower.startsWith("cancel") ||
        catLower.includes("cancel/") ||
        txtLower.startsWith("cancel") ||
        txtLower.includes("cancel/")
      ) {
        primaryCancelNote = combined;
        break;
      }
    }

    // 2. Fallback to latest note if available
    const latestNote = notes.length > 0
      ? `${notes[0].category ? `[${notes[0].category}] ` : ""}${notes[0].text || ""}`.trim()
      : null;

    return {
      allNotes: notes,
      primaryCancelNote,
      latestNote,
    };
  } catch (err) {
    console.warn(`Failed to fetch Firebase notes for consignment ${cleanCid}:`, err);
    return { allNotes: [], primaryCancelNote: null, latestNote: null };
  }
}
