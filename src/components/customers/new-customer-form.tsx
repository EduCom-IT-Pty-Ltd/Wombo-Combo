"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCustomer, type CreateCustomerState } from "@/app/actions/customers";
import { Button, Card, CardHeader } from "@/components/ui";

const initial: CreateCustomerState = { status: "idle" };
const inputClass = "w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

export function NewCustomerForm({ priceLists, projectTemplates }: { priceLists: Array<{ id: string; name: string }>; projectTemplates: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(createCustomer, initial);
  return (
    <form action={action}>
      <Card>
        <CardHeader title="Customer details" description="Created in Xero as well, so quotes and invoices for this customer land on the right contact." />
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <Text name="name" label="Customer name" required error={state.errors?.name} />
          <Text name="accountType" label="Account type" placeholder="Direct client, head contractor…" />
          <Text name="contactName" label="Primary contact" />
          <Text name="contactEmail" label="Contact email" type="email" error={state.errors?.contactEmail} />
          <Text name="contactPhone" label="Contact phone" type="tel" />
          <Text name="paymentTermsDays" label="Payment terms (days)" type="number" defaultValue="30" error={state.errors?.paymentTermsDays} />
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Customer price list</span><select name="priceListId" className={inputClass}><option value="">Standard default pricing</option>{priceLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select><span className="mt-1 block min-h-4 text-xs text-muted-foreground">Overrides default material prices when quoting.</span></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Default project template</span><select name="defaultProjectTemplateId" className={inputClass}><option value="">Standard project</option>{projectTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><span className="mt-1 block min-h-4 text-xs text-muted-foreground">Preselects the project workflow when this customer is chosen.</span></label>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3">
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Add customer"}</Button>
          {state.status === "error" ? <p className="text-xs text-[var(--tone-rose-fg)]">{state.message}</p> : null}
          {state.status === "success" ? <p className="text-xs text-[var(--tone-emerald-fg)]">{state.message} {state.customerId ? <Link href={`/customers/${state.customerId}`} className="font-medium underline">Open customer</Link> : null}</p> : null}
        </div>
      </Card>
    </form>
  );
}

function Text({ name, label, type = "text", required, placeholder, defaultValue, error }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string; error?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} className={inputClass} /><span className="mt-1 block min-h-4 text-xs text-[var(--tone-rose-fg)]">{error}</span></label>;
}
