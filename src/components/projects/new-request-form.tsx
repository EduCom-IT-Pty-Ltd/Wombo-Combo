"use client";

import { useActionState } from "react";
import { createProjectRequest, type NewRequestState } from "@/app/actions/new-request";
import { Button, Card, CardHeader } from "@/components/ui";

const initial: NewRequestState = { status: "idle" };

/**
 * Captures the spec's "New Request": customer, site, scope, notes. Uses the
 * form-action + `useActionState` pattern so it works without JS and reports
 * field errors from the same Zod schema the server validates with.
 */
export function NewRequestForm({ customers }: { customers: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(createProjectRequest, initial);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader title="Request details" />
        <div className="space-y-4 px-4 py-4">
          <Text name="title" label="Project title" error={state.errors?.title} required />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Customer</span>
              <select name="customerId" required className={inputClass}>
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError message={state.errors?.customerId} />
            </label>

            <Text name="siteName" label="Site name" error={state.errors?.siteName} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="contactName" label="Site contact" error={state.errors?.contactName} />
            <Text name="requestedStartOn" label="Requested start" type="date" error={state.errors?.requestedStartOn} />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Scope of works</span>
            <textarea
              name="scopeOfWorks"
              rows={5}
              placeholder="What is being installed, where, and anything that affects access or sequencing."
              className={inputClass}
            />
            <FieldError message={state.errors?.scopeOfWorks} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Initial notes</span>
            <textarea name="initialNotes" rows={3} className={inputClass} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Creating…" : "Create request"}
          </Button>
          {state.status === "error" ? (
            <p className="text-xs text-[var(--tone-rose-fg)]">{state.message}</p>
          ) : null}
          {state.status === "success" ? (
            <p className="text-xs text-[var(--tone-emerald-fg)]">{state.message}</p>
          ) : null}
          <p className="ml-auto text-xs text-muted-foreground">
            Saving assigns the next project number and creates the document folder.
          </p>
        </div>
      </Card>
    </form>
  );
}

const inputClass =
  "w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

function Text({
  name,
  label,
  type = "text",
  required,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input type={type} name={name} required={required} className={inputClass} />
      <FieldError message={error} />
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1 block text-xs text-[var(--tone-rose-fg)]">{message}</span>;
}
