"use client";

import { useActionState, useMemo, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { saveQuoteDocumentTemplate, type QuoteTemplateActionState } from "@/app/actions/quote-template";
import { Button, Card } from "@/components/ui";
import { QUOTE_DYNAMIC_FIELDS, type QuoteDocumentTemplateSettings, type QuoteDynamicField, type QuoteTemplateFieldType } from "@/lib/data/types";

const initial: QuoteTemplateActionState = { ok: false };
const inputClass = "h-10 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground";

const FIELD_LABELS: Record<QuoteDynamicField, string> = {
  quote_reference: "Quote reference",
  quote_date: "Quote date",
  project_name: "Project name",
  project_number: "Project number",
  customer_name: "Customer name",
  customer_contact: "Customer contact",
  site_address: "Site address",
  quote_total: "Quote total",
};

const FIELD_TYPES: Array<{ value: QuoteTemplateFieldType; label: string }> = [...QUOTE_DYNAMIC_FIELDS.map((value) => ({ value, label: FIELD_LABELS[value] })), { value: "plain_text", label: "Plain text" }];

const PREVIEW_VALUES: Record<QuoteDynamicField, string> = {
  quote_reference: "NLI-2026-0051-Q1",
  quote_date: "30 July 2026",
  project_name: "EduCom Test1",
  project_number: "NLI-2026-0051",
  customer_name: "Brightpath Education Trust",
  customer_contact: "Dean Taylor",
  site_address: "Dean Street, Brisbane QLD",
  quote_total: "$12,345.00",
};

function clamp(value: number) { return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0; }

export function QuoteLetterheadDesigner({ settings }: { settings: QuoteDocumentTemplateSettings }) {
  const [state, action, pending] = useActionState(saveQuoteDocumentTemplate, initial);
  const [template, setTemplate] = useState(settings);
  const [previewLetterhead, setPreviewLetterhead] = useState(settings.letterheadUrl);
  const serialised = useMemo(() => JSON.stringify(template), [template]);

  function updateField(id: string, update: Partial<QuoteDocumentTemplateSettings["fields"][number]>) {
    setTemplate((current) => ({ ...current, fields: current.fields.map((field) => field.id === id ? { ...field, ...update } : field) }));
  }
  function addField(type: QuoteTemplateFieldType = "customer_name") {
    const firstUnused = QUOTE_DYNAMIC_FIELDS.find((field) => !template.fields.some((item) => item.field === field)) ?? "customer_name";
    setTemplate((current) => ({ ...current, fields: [...current.fields, { id: globalThis.crypto?.randomUUID?.() ?? `field-${Date.now()}`, field: type === "customer_name" ? firstUnused : type, text: type === "plain_text" ? "Add your message here" : undefined, x: 10, y: 20 + current.fields.length * 6, width: 35 }] }));
  }
  function updateTable(key: "x" | "y" | "width", value: number) { setTemplate((current) => ({ ...current, table: { ...current.table, [key]: clamp(value) } })); }

  // Container query, not a breakpoint: the settings rail takes ~14rem out of the
  // page, so viewport width says nothing useful about the room this form has.
  return <Card><form action={action} className="@container space-y-4 p-4"><input type="hidden" name="settings" value={serialised} /><div className="grid gap-5 @[52rem]:grid-cols-[minmax(0,1fr)_22rem]"><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Letterhead artwork</span><span className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-muted px-3 text-sm font-semibold hover:border-primary hover:text-primary"><ImagePlus className="size-4" /> Upload PNG, JPG or WebP<input name="letterhead" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPreviewLetterhead(URL.createObjectURL(file)); }} /></span></label><div className="rounded-lg border border-border-subtle bg-surface-muted p-3"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Information fields</p><p className="text-xs text-muted-foreground">Positions are percentages of the A4 page.</p></div><div className="flex gap-2"><Button type="button" size="sm" onClick={() => addField()} className="whitespace-nowrap" disabled={template.fields.length >= 12}><Plus className="size-3.5" /> Dynamic</Button><Button type="button" size="sm" onClick={() => addField("plain_text")} className="whitespace-nowrap" disabled={template.fields.length >= 12}><Plus className="size-3.5" /> Plain text</Button></div></div>{template.fields.length ? <div className="space-y-2">{template.fields.map((field) => <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_3.8rem_3.8rem_3.8rem_auto] items-end gap-2 rounded-lg border border-border-subtle bg-surface p-2"><label><span className="mb-1 block text-[10px] font-bold text-muted-foreground uppercase">Information</span><select value={field.field} onChange={(event) => updateField(field.id, { field: event.target.value as QuoteTemplateFieldType, text: event.target.value === "plain_text" ? field.text ?? "Add your message here" : undefined })} className={inputClass}>{FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><NumberField label="X" value={field.x} onChange={(value) => updateField(field.id, { x: clamp(value) })} /><NumberField label="Y" value={field.y} onChange={(value) => updateField(field.id, { y: clamp(value) })} /><NumberField label="Width" value={field.width} onChange={(value) => updateField(field.id, { width: clamp(value) })} /><Button type="button" size="sm" variant="ghost" aria-label={`Remove ${field.field === "plain_text" ? "plain text" : FIELD_LABELS[field.field]}`} onClick={() => setTemplate((current) => ({ ...current, fields: current.fields.filter((item) => item.id !== field.id) }))}><Trash2 className="size-4" /></Button>{field.field === "plain_text" ? <label className="col-span-5 block"><span className="mb-1 block text-[10px] font-bold text-muted-foreground uppercase">Plain text</span><input maxLength={200} value={field.text ?? ""} onChange={(event) => updateField(field.id, { text: event.target.value })} className={inputClass} /></label> : null}</div>)}</div> : <p className="text-sm text-muted-foreground">Add customer, project, quote, or plain text information to the letterhead.</p>}</div><div className="rounded-lg border border-border-subtle bg-surface-muted p-3"><p className="text-sm font-bold">Quote table position</p><div className="mt-3 grid grid-cols-3 gap-2"><NumberField label="X" value={template.table.x} onChange={(value) => updateTable("x", value)} /><NumberField label="Y" value={template.table.y} onChange={(value) => updateTable("y", value)} /><NumberField label="Width" value={template.table.width} onChange={(value) => updateTable("width", value)} /></div></div></div><QuotePreview settings={template} letterheadUrl={previewLetterhead} /></div><div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save quote template"}</Button><p className={`text-xs ${state.ok ? "text-[var(--tone-emerald-fg)]" : state.message ? "text-[var(--tone-rose-fg)]" : "text-muted-foreground"}`}>{state.message ?? "Use the preview to check the positions before saving."}</p></div></form></Card>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label><span className="mb-1 block text-[10px] font-bold text-muted-foreground uppercase">{label} %</span><input type="number" min="0" max="100" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>; }

function QuotePreview({ settings, letterheadUrl }: { settings: QuoteDocumentTemplateSettings; letterheadUrl: string | null }) {
  return <div className="mx-auto w-full max-w-[25rem]"><p className="mb-2 text-xs font-bold text-muted-foreground uppercase tracking-[0.1em]">A4 PDF preview</p><div className="relative aspect-[210/297] overflow-hidden rounded-md border border-border-strong bg-white text-slate-900 shadow-lg" style={letterheadUrl ? { backgroundImage: `url(${letterheadUrl})`, backgroundSize: "100% 100%" } : undefined}>{settings.fields.map((field) => <div key={field.id} className="absolute overflow-hidden rounded border border-dashed border-primary/60 bg-white/80 px-1 py-0.5 text-[7px] font-semibold leading-tight text-slate-800" style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%` }}>{field.field === "plain_text" ? field.text || "Plain text" : PREVIEW_VALUES[field.field]}</div>)}<div className="absolute rounded border border-dashed border-primary bg-white/90 text-[6px] shadow-sm" style={{ left: `${settings.table.x}%`, top: `${settings.table.y}%`, width: `${settings.table.width}%` }}><div className="grid grid-cols-[1fr_16%_22%] bg-slate-800 px-1 py-1 font-bold text-white"><span>Description</span><span className="text-right">Qty</span><span className="text-right">Total</span></div><div className="grid grid-cols-[1fr_16%_22%] border-b px-1 py-1"><span>Example material</span><span className="text-right">12 m²</span><span className="text-right">$720.00</span></div><div className="px-1 py-1 text-right font-bold">Total $12,345.00</div></div></div></div>;
}
