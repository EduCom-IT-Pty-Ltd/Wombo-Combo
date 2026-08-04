"use client";

import { useActionState, useState, useTransition } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { archiveCustomerRecord, deleteCustomerRecord, restoreCustomerRecord, type RecordActionState, updateCustomerRecord } from "@/app/actions/records";
import { Button } from "@/components/ui";
import type { Customer } from "@/lib/data/types";

const initial: RecordActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function CustomerOptions({ customer, priceLists, projectTemplates, archived = false }: { customer: Customer; priceLists: Array<{ id: string; name: string }>; projectTemplates: Array<{ id: string; name: string }>; archived?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false); const [editing, setEditing] = useState(false); const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter();

  // Archiving and deleting can be refused — a customer with projects still on
  // the books cannot be deleted. Navigate only once the action says it worked,
  // otherwise the refusal scrolls past on a page we have already left.
  function run(action: () => Promise<RecordActionState>, destination: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) { setError(result.message ?? "That did not work."); return; }
      setMenuOpen(false);
      router.push(destination);
      router.refresh();
    });
  }

  return <div className="relative"><Button type="button" size="sm" variant="ghost" aria-label="Customer options" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal className="size-5" /></Button>{menuOpen ? <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-border-strong bg-surface p-1 shadow-xl"><button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => { setEditing(true); setMenuOpen(false); }}>Edit customer</button>{archived ? <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted" disabled={pending} onClick={() => run(() => restoreCustomerRecord(customer.id), `/customers/${customer.id}`)}>Restore</button> : <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted" disabled={pending} onClick={() => { if (window.confirm(`Archive ${customer.name}? It will move to the Archived customers view.`)) run(() => archiveCustomerRecord(customer.id), "/customers?archived=1"); }}>Archive</button>}<button className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--tone-rose-fg)] hover:bg-surface-muted" disabled={pending} onClick={() => { if (window.confirm(`Delete ${customer.name} permanently? Existing project records will retain their saved customer snapshot.`)) run(() => deleteCustomerRecord(customer.id), "/customers"); }}>Delete permanently</button>{error ? <p className="px-3 py-2 text-xs text-[var(--tone-rose-fg)]">{error}</p> : null}</div> : null}{editing ? <CustomerEditor customer={customer} priceLists={priceLists} projectTemplates={projectTemplates} onClose={() => setEditing(false)} /> : null}</div>;
}

function CustomerEditor({ customer, priceLists, projectTemplates, onClose }: { customer: Customer; priceLists: Array<{ id: string; name: string }>; projectTemplates: Array<{ id: string; name: string }>; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateCustomerRecord, initial);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Edit customer"><form action={action} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold">Edit customer</h2><p className="mt-0.5 text-sm text-muted-foreground">Update account details, pricing, and its default project template.</p></div><Button type="button" size="sm" variant="ghost" aria-label="Close edit customer" onClick={onClose}><X className="size-4" /></Button></div><div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2"><input type="hidden" name="id" value={customer.id} /><Field name="name" label="Customer name" defaultValue={customer.name} required /><Field name="accountType" label="Account type" defaultValue={customer.accountType ?? ""} /><Field name="contactName" label="Primary contact" defaultValue={customer.primaryContactName ?? ""} /><Field name="contactEmail" label="Contact email" defaultValue={customer.primaryContactEmail ?? ""} type="email" /><Field name="contactPhone" label="Contact phone" defaultValue={customer.primaryContactPhone ?? ""} /><Field name="paymentTermsDays" label="Payment terms (days)" defaultValue={String(customer.paymentTermsDays)} type="number" required /><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Customer price list</span><select name="priceListId" defaultValue={customer.priceListId ?? ""} className={inputClass}><option value="">Standard default pricing</option>{priceLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Default project template</span><select name="defaultProjectTemplateId" defaultValue={customer.defaultProjectTemplateId ?? ""} className={inputClass}><option value="">Standard project</option>{projectTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label></div><div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-4"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>{state.message ? <p className={`text-xs ${state.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>{state.message}</p> : null}</div></form></div>;
}

function Field({ name, label, defaultValue, type = "text", required = false }: { name: string; label: string; defaultValue: string; type?: string; required?: boolean }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue} className={inputClass} /></label>; }
