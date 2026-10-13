import { fetchConsignmentNotesFromFirebase } from "@/lib/weblog/firebase-notes";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { MessageSquareText, Tag } from "lucide-react";
import { formatDateTime } from "@/lib/weblog/utils";

interface ConsignmentNotesCardProps {
  consignmentId: string | null | undefined;
}

export async function ConsignmentNotesCard({ consignmentId }: ConsignmentNotesCardProps) {
  if (!consignmentId) return null;

  const { allNotes } = await fetchConsignmentNotesFromFirebase(consignmentId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="h-4 w-4 text-blue-500" />
            <span>Steadfast Notes (Firebase)</span>
          </CardTitle>
          <span className="text-xs font-mono text-slate-400">#{consignmentId}</span>
        </div>
        <CardDescription>
          Live notes and cancellation reasons synced from Steadfast courier portal
        </CardDescription>
      </CardHeader>
      <CardContent>
        {allNotes.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">
            No notes recorded on Steadfast for this consignment yet.
          </p>
        ) : (
          <div className="space-y-3">
            {allNotes.map((note) => {
              const isCancelNote =
                (note.category || "").toLowerCase().includes("cancel") ||
                (note.text || "").toLowerCase().includes("cancel");

              return (
                <div
                  key={note.id || Math.random().toString()}
                  className={`rounded-lg border p-3 text-sm ${
                    isCancelNote
                      ? "border-rose-200 bg-rose-50/70 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                      : "border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    {note.category ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                          isCancelNote
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                        }`}
                      >
                        <Tag className="h-3 w-3" />
                        {note.category}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">General Note</span>
                    )}
                    {note.created ? (
                      <span className="text-[11px] text-slate-400 font-mono">
                        {formatDateTime(new Date(note.created))}
                      </span>
                    ) : null}
                  </div>
                  {note.text ? (
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">
                      {note.text}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
