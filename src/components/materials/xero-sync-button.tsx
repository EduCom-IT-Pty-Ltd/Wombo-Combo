"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncMaterialsFromXero } from "@/app/actions/xero";
import { Button } from "@/components/ui";

/**
 * Pull the catalogue from Xero's items.
 *
 * Deliberately not automatic. A price change in Xero should not silently rewrite
 * the catalogue underneath someone mid-quote — this is a thing you do when you
 * know prices have moved, and the result tells you exactly what changed.
 */
export function XeroSyncButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const outcome = await syncMaterialsFromXero();
            setResult(outcome);
            if (outcome.ok) router.refresh();
          })
        }
      >
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden />
        {pending ? "Syncing…" : "Sync from Xero"}
      </Button>
      {result ? (
        <p className={`w-full text-xs ${result.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>
          {result.message}
        </p>
      ) : null}
    </>
  );
}
