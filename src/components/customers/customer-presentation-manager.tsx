"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Palette, X } from "lucide-react";
import { saveCustomerPortalPresentationAction, type CustomerPresentationActionState } from "@/app/actions/customer-presentation";
import { customerColorFor } from "@/lib/domain/customer-colors";
import type { Customer } from "@/lib/data/types";
import { Button, Card, CardHeader } from "@/components/ui";

const initial: CustomerPresentationActionState = { ok: false };

type CustomerDisplay = { id: string; portalVisible: boolean; color: string | null };

/** Local-only customer visibility and Call-Up colour settings. */
export function CustomerPresentationManager({ customers }: { customers: Customer[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveCustomerPortalPresentationAction, initial);
  const [entries, setEntries] = useState<CustomerDisplay[]>(() => customers.map((customer) => ({
    id: customer.id,
    portalVisible: customer.portalVisible !== false,
    color: customer.color ?? customerColorFor(customer.id),
  })));
  const visibleCount = entries.filter((entry) => entry.portalVisible).length;
  const customersById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  function update(id: string, update: Partial<CustomerDisplay>) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...update } : entry));
  }

  return <Card>
    <CardHeader
      title="Portal customer display"
      description="Choose which active contacts appear in portal customer lists and new-project pickers. This does not change Xero."
      action={<Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}><Eye className="size-4" />Visible customers · {visibleCount}</Button>}
    />
    <p className="px-4 py-3 text-sm text-muted-foreground">Call-Ups in Calendar and Field use the customer colour set here, rather than the assigned staff member&apos;s colour.</p>
    {open ? createPortal(
      <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="customer-display-title">
        <form action={action} className="pb-safe flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border-strong bg-surface shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
          <input type="hidden" name="presentation" value={JSON.stringify(entries)} />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <div>
              <h2 id="customer-display-title" className="text-lg font-bold">Visible in portal</h2>
              <p className="mt-1 text-sm text-muted-foreground">Hidden contacts stay safely synced in Xero, but do not appear in the portal until you show them.</p>
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)} aria-label="Close customer display"><X className="size-4" /></Button>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-border-subtle overflow-y-auto">
            {entries.map((entry) => {
              const customer = customersById.get(entry.id);
              if (!customer) return null;
              return <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                <input aria-label={`${customer.name} Call-Up colour`} type="color" value={entry.color ?? customerColorFor(entry.id)} disabled={pending} onChange={(event) => update(entry.id, { color: event.target.value })} className="size-10 shrink-0 cursor-pointer rounded-lg border border-border-strong bg-surface p-1" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{customer.name}</p><p className="text-xs text-muted-foreground">{entry.portalVisible ? "Shown in portal" : "Hidden from portal"}</p></div>
                <Button type="button" size="sm" variant={entry.portalVisible ? "ghost" : "secondary"} disabled={pending} onClick={() => update(entry.id, { portalVisible: !entry.portalVisible })}>{entry.portalVisible ? <><EyeOff className="size-4" />Hide</> : <><Eye className="size-4" />Show</>}</Button>
              </div>;
            })}
            {!entries.length ? <p className="p-6 text-center text-sm text-muted-foreground">No active customers are available yet.</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
            <p className="text-xs text-muted-foreground"><Palette className="mr-1 inline size-3.5" />{visibleCount} shown · {entries.length - visibleCount} hidden</p>
            <div className="flex gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save portal display"}</Button></div>
            {state.message ? <p className={state.ok ? "w-full text-xs font-semibold text-emerald-600" : "w-full text-xs font-semibold text-[var(--tone-rose-fg)]"}>{state.message}</p> : null}
          </div>
        </form>
      </div>,
      document.body,
    ) : null}
  </Card>;
}
