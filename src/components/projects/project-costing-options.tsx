"use client";

import { useActionState } from "react";
import { saveProjectCostingOptions, type LabourActionState } from "@/app/actions/labour";
import { Button, Card, CardHeader } from "@/components/ui";
import type { LabourSettings, ProjectCostingOptions } from "@/lib/data/types";
import { formatMoney } from "@/lib/domain/money";

const initial: LabourActionState = { ok: false };

export function ProjectCostingOptionsForm({ projectId, settings, options, currency }: { projectId: string; settings: LabourSettings; options: ProjectCostingOptions; currency: string }) {
  const [state, action, pending] = useActionState(saveProjectCostingOptions, initial);
  return <Card><CardHeader title="Budget & subcontractor options" description="These settings apply only to this project." /><form action={action} className="grid gap-4 p-4 lg:grid-cols-2"><input type="hidden" name="projectId" value={projectId} /><label className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 ${settings.standardLabourEnabled ? "border-border-subtle bg-surface-muted" : "border-dashed border-border-strong bg-surface-muted/60 opacity-70"}`}><input name="standardLabourEnabled" type="checkbox" defaultChecked={options.standardLabourEnabled} disabled={!settings.standardLabourEnabled} className="size-5 accent-primary" /><span><span className="block text-sm font-bold">Use standard labour budget</span><span className="block text-xs text-muted-foreground">{settings.standardLabourEnabled ? `${formatMoney(settings.standardLabourCostCentsPerEmployee, currency)} per employee, per job` : "Enable and configure this in Labour first."}</span></span></label><label className="block text-sm font-semibold">Employees on this job<input name="employeeCount" type="number" min="0" max="99" defaultValue={options.employeeCount || ""} placeholder="0" className="mt-1 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm" /></label><label className="flex min-h-11 items-center gap-3 rounded-lg border border-border-subtle bg-surface-muted px-3 lg:col-span-2"><input name="includeSubcontractorMaterialCosts" type="checkbox" defaultChecked={options.includeSubcontractorMaterialCosts} className="size-5 accent-primary" /><span><span className="block text-sm font-bold">Include subcontractor material cost</span><span className="block text-xs text-muted-foreground">Uses the quoted m² quantities and subcontractor rates configured in Labour.</span></span></label><div className="flex flex-wrap items-center gap-3 lg:col-span-2"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save costing options"}</Button>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</div></form></Card>;
}
