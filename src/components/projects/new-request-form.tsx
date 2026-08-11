"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createProjectRequest, type NewRequestState } from "@/app/actions/new-request";
import { Button, Card, CardHeader } from "@/components/ui";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { ProjectTemplate } from "@/lib/data/types";

const initial: NewRequestState = { status: "idle" };

/**
 * Captures the spec's "New Request": customer, site, scope, notes. Uses the
 * form-action + `useActionState` pattern so it works without JS and reports
 * field errors from the same Zod schema the server validates with.
 */
export function NewRequestForm({ customers, templates, defaultCustomerId, isDemo }: { customers: Array<{ id: string; name: string; defaultProjectTemplateId: string | null }>; templates: ProjectTemplate[]; defaultCustomerId?: string; isDemo?: boolean }) {
  const [state, formAction, pending] = useActionState(createProjectRequest, initial);
  // Arriving from a customer page pre-applies that customer's default template,
  // the same as picking them from the field would. The chosen customer itself
  // lives in the picker; only the template it implies is needed out here.
  const [templateId, setTemplateId] = useState(
    () => customers.find((customer) => customer.id === defaultCustomerId)?.defaultProjectTemplateId ?? "",
  );
  const [projectType, setProjectType] = useState<"build" | "retro">("build");

  return (
    <form action={formAction}>
      <Card>
        <CardHeader title="Request details" />
        <div className="space-y-4 px-4 py-4">
          <div className="rounded-xl border border-border-subtle bg-surface-muted p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold">Project type</p><p className="text-xs text-muted-foreground">Build uses the standard workflow. Retro adds a detailed assessment scope after creation.</p></div><div className="inline-flex rounded-lg border border-border-subtle bg-surface p-1"><button type="button" onClick={() => setProjectType("build")} className={`min-h-10 rounded-md px-4 text-sm font-semibold transition ${projectType === "build" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Build</button><button type="button" onClick={() => setProjectType("retro")} className={`min-h-10 rounded-md px-4 text-sm font-semibold transition ${projectType === "retro" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Retro</button></div></div><input type="hidden" name="projectType" value={projectType} /></div>
          <Text name="title" label="Project title" error={state.errors?.title} required />

          <div className="grid gap-4 sm:grid-cols-2">
            <CustomerPicker
              customers={customers}
              defaultCustomerId={defaultCustomerId}
              required
              error={state.errors?.customerId}
              onSelect={(customer) => setTemplateId(customer?.defaultProjectTemplateId ?? "")}
            />

            <Text name="siteName" label="Site name" error={state.errors?.siteName} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="siteAddress" label="Site address" placeholder="Street address" error={state.errors?.siteAddress} />
            <Text name="contactName" label="Site contact" error={state.errors?.contactName} />
          </div>

          <Text name="requestedStartOn" label="Requested start" type="date" error={state.errors?.requestedStartOn} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Project type</span>
            <select name="projectTemplateId" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className={inputClass}>
              <option value="">Standard project · starts at Request Received</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <span className="mt-1 block min-h-4 text-xs text-muted-foreground">A customer default is selected automatically; you can choose a different option for this project.</span>
          </label>

          {templateId ? <Text name="poNumber" label="PO number (if available)" placeholder="Pre-fills the PO Received stage" /> : null}

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
            {pending ? "Creating…" : "Create project"}
          </Button>
          {state.status === "error" ? (
            <p className="text-xs text-[var(--tone-rose-fg)]">
              {state.message}{" "}
              {/* The project exists but its template did not apply. Offer the way
                  in anyway rather than leaving it stranded on the list page. */}
              {state.projectId ? <Link className="font-medium underline" href={`/projects/${state.projectId}`}>Open project</Link> : null}
            </p>
          ) : null}
          {isDemo ? (
            <p className="ml-auto text-xs text-muted-foreground">
              Demo data — this project is saved to the demo dataset, not a database.
            </p>
          ) : null}
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
  placeholder,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input type={type} name={name} required={required} placeholder={placeholder} className={inputClass} />
      <FieldError message={error} />
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1 block text-xs text-[var(--tone-rose-fg)]">{message}</span>;
}
