"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, X } from "lucide-react";
import { archiveStaleXeroCustomers, reviewXeroCustomerCleanup } from "@/app/actions/xero";
import type { StaleCustomer } from "@/lib/integrations/xero/contacts";
import { Button } from "@/components/ui";

/**
 * Tidy up what an earlier, looser sync pulled in.
 *
 * Two steps, never one. The first only reads, and shows exactly which customers
 * would go and how much work is attached to each; the second archives the ones
 * still ticked. A single button that read Xero and acted on the answer would,
 * on a short read, quietly take a page of customers off everybody's forms.
 *
 * Rows with projects start unticked. They are the ones with job history behind
 * them, so removing them should be a decision somebody makes on purpose rather
 * than the default they forgot to look at.
 */

const REASONS: Record<StaleCustomer["reason"], string> = {
  supplier: "Supplier in Xero",
  archived: "Archived in Xero",
  missing: "No longer in Xero",
};

export function XeroCleanupButton() {
  const [pending, start] = useTransition();
  const [stale, setStale] = useState<StaleCustomer[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  function review() {
    setResult(null);
    start(async () => {
      const outcome = await reviewXeroCustomerCleanup();
      if (!outcome.ok) {
        setResult({ ok: false, message: outcome.message ?? "Could not check Xero." });
        return;
      }
      const rows = outcome.stale ?? [];
      setStale(rows);
      setSelected(new Set(rows.filter((row) => row.projectCount === 0).map((row) => row.id)));
      if (rows.length === 0) {
        setStale(null);
        setResult({ ok: true, message: "Nothing to clean up — every customer here is still a customer in Xero." });
      }
    });
  }

  function archive() {
    start(async () => {
      const outcome = await archiveStaleXeroCustomers([...selected]);
      setResult(outcome);
      if (outcome.ok) {
        setStale(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={review}>
        <Archive className="size-3.5" aria-hidden />
        {pending && !stale ? "Checking…" : "Clean up"}
      </Button>

      {result ? (
        <p className={`w-full text-xs ${result.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>
          {result.message}
        </p>
      ) : null}

      {stale ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Clean up customers from Xero">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-border-strong bg-surface shadow-2xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div>
                <h2 className="text-base font-bold">Clean up customers</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {stale.length} {stale.length === 1 ? "customer is" : "customers are"} no longer a customer in Xero.
                  Archiving takes them off the customer list and every picker. Nothing is deleted, and nothing is
                  changed in Xero.
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" aria-label="Close clean-up" onClick={() => setStale(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="overflow-y-auto">
              <ul className="divide-y divide-border-subtle">
                {stale.map((row) => (
                  <li key={row.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-[var(--color-primary)]"
                        checked={selected.has(row.id)}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {REASONS[row.reason]}
                          {row.projectCount
                            ? ` · ${row.projectCount} project${row.projectCount === 1 ? "" : "s"} — left unticked`
                            : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-4 pb-safe">
              <Button type="button" variant="primary" disabled={pending || selected.size === 0} onClick={archive}>
                {pending ? "Archiving…" : `Archive ${selected.size} customer${selected.size === 1 ? "" : "s"}`}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStale(null)}>
                Cancel
              </Button>
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground underline"
                onClick={() =>
                  setSelected((current) => (current.size === stale.length ? new Set() : new Set(stale.map((row) => row.id))))
                }
              >
                {selected.size === stale.length ? "Untick all" : "Tick all"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
