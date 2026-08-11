"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Save } from "lucide-react";
import { saveSwmsTemplateAction, type SwmsActionState } from "@/app/actions/swms";
import type { SwmsChoice, SwmsHazard, SwmsTemplate } from "@/lib/domain/swms";
import { Badge, Button, Card, CardHeader } from "@/components/ui";

const initial: SwmsActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground sm:text-sm";
const textClass = "min-h-28 w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-base text-foreground sm:text-sm";

function listText(items: SwmsChoice[]) { return items.map((item) => item.label).join("\n"); }
function lines(value: string, previous: SwmsChoice[]): SwmsChoice[] {
  return value.split("\n").map((label) => label.trim()).filter(Boolean).map((label, index) => ({ id: previous[index]?.id ?? `custom-${index + 1}`, label }));
}
function hazardText(items: SwmsHazard[]) { return items.map((item) => [item.task, item.hazard, item.controls].join(" | ")).join("\n"); }
function hazards(value: string, previous: SwmsHazard[]): SwmsHazard[] {
  return value.split("\n").map((line, index) => {
    const [task = "", hazard = "", controls = ""] = line.split("|").map((part) => part.trim());
    return task && hazard ? { id: previous[index]?.id ?? `custom-hazard-${index + 1}`, task, hazard, controls } : null;
  }).filter((item): item is SwmsHazard => item !== null);
}

export function SwmsTemplateManager({ template }: { template: SwmsTemplate }) {
  const [state, action, pending] = useActionState(saveSwmsTemplateAction, initial);
  const [draft, setDraft] = useState(() => ({
    name: template.name, versionLabel: template.versionLabel, mandatoryNotice: template.mandatoryNotice,
    quickReference: template.quickReference.join("\n"), scopeItems: listText(template.scopeItems),
    siteReportItems: listText(template.siteReportItems), photoChecklist: listText(template.photoChecklist), hazards: hazardText(template.hazards),
  }));
  const serialised = useMemo(() => JSON.stringify({
    name: draft.name, versionLabel: draft.versionLabel, mandatoryNotice: draft.mandatoryNotice,
    quickReference: draft.quickReference.split("\n").map((line) => line.trim()).filter(Boolean),
    scopeItems: lines(draft.scopeItems, template.scopeItems), siteReportItems: lines(draft.siteReportItems, template.siteReportItems),
    photoChecklist: lines(draft.photoChecklist, template.photoChecklist), hazards: hazards(draft.hazards, template.hazards),
  }), [draft, template]);
  const set = (key: keyof typeof draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="template" value={serialised} />
      <Card className="overflow-hidden">
        <CardHeader title="SWMS template" description="This is the form each project starts from. Your changes apply to future and existing SWMS forms without altering the original SharePoint files." />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label><span className="mb-1 block text-xs font-semibold text-muted-foreground">Document title</span><input className={inputClass} value={draft.name} onChange={set("name")} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-muted-foreground">Version label</span><input className={inputClass} value={draft.versionLabel} onChange={set("versionLabel")} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Mandatory notice</span><input className={inputClass} value={draft.mandatoryNotice} onChange={set("mandatoryNotice")} /></label>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TemplateList label="Scope of work choices" hint="One choice per line." value={draft.scopeItems} onChange={set("scopeItems")} />
        <TemplateList label="Site report checklist" hint="One item per line." value={draft.siteReportItems} onChange={set("siteReportItems")} />
        <TemplateList label="Photo checklist" hint="One item per line. These appear beside the photo uploads." value={draft.photoChecklist} onChange={set("photoChecklist")} />
        <TemplateList label="Quick reference" hint="One instruction per line." value={draft.quickReference} onChange={set("quickReference")} />
      </div>

      <Card>
        <CardHeader title="Safety analysis" description="One row per line, using: task | hazard/risk | control measures. The checkboxes in the project form remain linked to each row." />
        <div className="p-4"><textarea className={textClass} value={draft.hazards} onChange={set("hazards")} /></div>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border-strong bg-surface/95 p-3 shadow-lg backdrop-blur">
        <Button type="submit" variant="primary" disabled={pending}><Save className="size-4" />{pending ? "Saving…" : "Save SWMS template"}</Button>
        {state.message ? <span className={state.ok ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold text-[var(--tone-rose-fg)]"}>{state.ok ? <CheckCircle2 className="mr-1 inline size-4" /> : null}{state.message}</span> : null}
        <Badge tone="blue"><ClipboardCheck className="size-3" />Configured form</Badge>
      </div>
    </form>
  );
}

function TemplateList({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void }) {
  return <Card><CardHeader title={label} description={hint} /><div className="p-4"><textarea className={textClass} value={value} onChange={onChange} /></div></Card>;
}
