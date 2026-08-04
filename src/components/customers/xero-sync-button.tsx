"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncCustomersFromXero } from "@/app/actions/xero";
import { Button } from "@/components/ui";

/**
 * Pull the customer list from Xero's contacts.
 *
 * Manual for the same reason the material sync is: a customer renamed or
 * archived in Xero should not rearrange the list underneath someone raising a
 * job, and the result names what actually moved.
 */
export function CustomerXeroSyncButton() {
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
            const outcome = await syncCustomersFromXero();
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
