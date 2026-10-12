"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FollowUpButtonProps {
  customerId: string;
  isFollowedUp: boolean;
}

export function FollowUpButton({ customerId, isFollowedUp }: FollowUpButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(isFollowedUp);

  const handleMarkFollowUp = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/nn-weblog/customers/${customerId}/follow-up`, {
        method: "POST",
      });

      if (res.ok) {
        setDone(true);
        router.refresh();
      }
    } catch (err) {
      console.error("Follow up error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <span>Followed Up</span>
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleMarkFollowUp}
      disabled={loading}
      className="gap-1.5 text-xs border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      <span>Mark as Followed Up</span>
    </Button>
  );
}
