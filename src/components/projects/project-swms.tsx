"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, Download, Edit3, Eye, Plus, Save, Trash2, X } from "lucide-react";
import { deleteProjectSwmsAction, exportProjectSwmsPdfAction, saveProjectSwmsAction, uploadSwmsPhotoAction, type SwmsActionState } from "@/app/actions/swms";
import type { DocumentRecord, ProjectDetail } from "@/lib/data/types";
import { emptySwmsValues, type SwmsRecord, type SwmsTemplate, type SwmsValues } from "@/lib/domain/swms";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const initial: SwmsActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground disabled:cursor-not-allowed disabled:opacity-75 sm:text-sm";
const textClass = "min-h-24 w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-base text-foreground disabled:cursor-not-allowed disabled:opacity-75 sm:text-sm";

export function ProjectSwms({ project, template, record, photos, canEdit }: { project: ProjectDetail; template: SwmsTemplate; record: SwmsRecord | null; photos: DocumentRecord[]; canEdit: boolean }) {
  const [mode, setMode] = useState<"add" | "view" | "edit" | null>(null);
  const [deleting, startDelete] = useTransition();
  const [exporting, startExport] = useTransition();
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const close = () => setMode(null);
  const exportPdf = () => {
    startExport(async () => {
      setExportMessage(null);
      const result = await exportProjectSwmsPdfAction(project.id);
      setExportMessage(result.message ?? null);
      if (result.ok && result.downloadUrl) {
        // An attachment response in an invisible frame triggers the device
        // download without replacing this project page or leaving a blank tab.
        const frame = document.createElement("iframe");
        frame.className = "hidden";
        frame.title = "SWMS PDF download";
        frame.src = result.downloadUrl;
        document.body.append(frame);
        window.setTimeout(() => frame.remove(), 60_000);
        return;
      }
    });
  };
  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <CardHeader
        title="Safe Work Method Statement"
        description={record ? `Saved ${formatDate(record.updatedAt)} · ${record.templateName} ${record.templateVersion}` : "Capture the site's safety checks, hazards, installer sign-off and supporting photos."}
        action={<div className="flex flex-wrap gap-2">{record ? <><Button size="sm" variant="secondary" onClick={() => setMode("view")}><Eye className="size-4" />View</Button>{canEdit ? <Button size="sm" variant="primary" onClick={() => setMode("edit")}><Edit3 className="size-4" />Edit</Button> : null}</> : canEdit ? <Button size="sm" variant="primary" onClick={() => setMode("add")}><Plus className="size-4" />Add SWMS</Button> : null}</div>}
      />
      {record ? <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-4 py-3 text-sm"><Badge tone="emerald"><CheckCircle2 className="size-3" />SWMS saved</Badge><span className="text-muted-foreground">{record.photoDocumentIds.length} linked photo{record.photoDocumentIds.length === 1 ? "" : "s"} in the project SharePoint folder.</span>{canEdit ? <><Button size="sm" variant="secondary" disabled={exporting} onClick={exportPdf}><Download className="size-4" />{exporting ? "Exporting…" : "Export PDF"}</Button><Button size="sm" variant="ghost" disabled={deleting} onClick={() => { if (window.confirm("Delete this SWMS record? The project photos stay safely stored in SharePoint.")) startDelete(async () => { await deleteProjectSwmsAction(project.id); close(); }); }} className="text-[var(--tone-rose-fg)]"><Trash2 className="size-4" />{deleting ? "Deleting…" : "Delete"}</Button></> : null}{exportMessage ? <span className="w-full text-xs text-muted-foreground">{exportMessage}</span> : null}</div> : <div className="border-t border-border-subtle p-4"><EmptyState title="No SWMS yet" description={canEdit ? "Add the site details, safety checks, hazards, installer sign-off and photos before work begins." : "An authorised team member can add the project's SWMS."} /></div>}
    </Card>
    {mode ? <SwmsDialog key={`${mode}-${record?.updatedAt ?? "new"}`} mode={mode} project={project} template={template} record={record} photos={photos} canEdit={canEdit} onClose={close} /> : null}
  </div>;
}

function SwmsDialog({ mode, project, template, record, photos, canEdit, onClose }: { mode: "add" | "view" | "edit"; project: ProjectDetail; template: SwmsTemplate; record: SwmsRecord | null; photos: DocumentRecord[]; canEdit: boolean; onClose: () => void }) {
  const defaults = { salesOrder: project.projectNumber, builder: project.customerName, siteAddress: project.site?.address ?? project.siteLabel ?? "", suburb: project.site?.suburb ?? "" };
  const [values, setValues] = useState<SwmsValues>(() => record?.values ?? emptySwmsValues(template, defaults));
  const [photoIds, setPhotoIds] = useState<string[]>(() => record?.photoDocumentIds ?? []);
  const [state, action, pending] = useActionState(saveProjectSwmsAction, initial);
  const viewOnly = mode === "view" || !canEdit;
  const photoDocs = photos.filter((photo) => photoIds.includes(photo.id));
  const update = <K extends keyof SwmsValues>(key: K, value: SwmsValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const json = useMemo(() => JSON.stringify(values), [values]);
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [onClose]);

  return createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Safe Work Method Statement">
    <div className="pb-safe flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-border-strong bg-surface shadow-2xl sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">Project SWMS</p><h2 className="mt-1 text-lg font-bold">{mode === "add" ? "Add Safe Work Method Statement" : viewOnly ? "View Safe Work Method Statement" : "Edit Safe Work Method Statement"}</h2><p className="mt-0.5 text-sm text-muted-foreground">{template.name} · {template.versionLabel}</p></div><Button size="sm" variant="ghost" aria-label="Close SWMS" onClick={onClose}><X className="size-4" /></Button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <form action={action} className="space-y-5">
          <input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="values" value={json} /><input type="hidden" name="photoDocumentIds" value={JSON.stringify(photoIds)} />
          <section className="rounded-xl border border-border-subtle p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">Project details</h3><p className="text-sm text-muted-foreground">{template.mandatoryNotice}</p></div><Badge tone="amber">Complete before work starts</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Sales order" value={values.salesOrder} disabled={viewOnly} onChange={(value) => update("salesOrder", value)} /><Field label="Date / time" type="datetime-local" value={toLocalDateTime(values.preparedAt)} disabled={viewOnly} onChange={(value) => update("preparedAt", value ? new Date(value).toISOString() : "")} /><Field label="Builder" value={values.builder} disabled={viewOnly} onChange={(value) => update("builder", value)} /><Field label="Site address" value={values.siteAddress} disabled={viewOnly} onChange={(value) => update("siteAddress", value)} /><Field label="Suburb" value={values.suburb} disabled={viewOnly} onChange={(value) => update("suburb", value)} /><Field label="Principal" value={values.principal} disabled={viewOnly} onChange={(value) => update("principal", value)} /><Field label="Lead installer name" value={values.leadInstaller} disabled={viewOnly} onChange={(value) => update("leadInstaller", value)} /></div></section>

          <ChecklistSection title="Scope of work" items={template.scopeItems} values={values.scope} disabled={viewOnly} onChange={(id, checked) => update("scope", { ...values.scope, [id]: checked })} extra={<TextField label="Repair" value={values.repairNotes} disabled={viewOnly} onChange={(value) => update("repairNotes", value)} />} />
          <section className="rounded-xl border border-border-subtle p-4"><h3 className="font-bold">Quick reference</h3><ol className="mt-3 grid list-decimal gap-x-7 gap-y-1 pl-5 text-sm text-muted-foreground sm:grid-cols-2">{template.quickReference.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <ChecklistSection title="Site report" items={template.siteReportItems} values={values.siteReport} disabled={viewOnly} onChange={(id, checked) => update("siteReport", { ...values.siteReport, [id]: checked })} extra={<div className="grid gap-3 sm:grid-cols-3"><TextField label="Other" value={values.otherSiteReport} disabled={viewOnly} onChange={(value) => update("otherSiteReport", value)} /><Check label="Power isolated and tagged" checked={values.powerIsolated} disabled={viewOnly} onChange={(checked) => update("powerIsolated", checked)} /><Check label="Power restored" checked={values.powerRestored} disabled={viewOnly} onChange={(checked) => update("powerRestored", checked)} /></div>} />

          <section className="overflow-hidden rounded-xl border border-border-subtle"><div className="border-b border-border-subtle bg-surface-muted px-4 py-3"><h3 className="font-bold">Safety analysis</h3><p className="text-sm text-muted-foreground">Select hazards present and confirm their control measures.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface-muted text-xs text-muted-foreground"><tr><th className="p-3">Task</th><th className="p-3">Hazard / risk</th><th className="p-3">Hazard present</th><th className="p-3">Control measures</th><th className="p-3">Controlled</th></tr></thead><tbody className="divide-y divide-border-subtle">{template.hazards.map((hazard) => <tr key={hazard.id} className="align-top"><td className="p-3 font-semibold">{hazard.task}</td><td className="p-3 text-muted-foreground">{hazard.hazard}</td><td className="p-3"><Check label="" checked={values.hazards[hazard.id]?.present ?? false} disabled={viewOnly} onChange={(checked) => update("hazards", { ...values.hazards, [hazard.id]: { ...values.hazards[hazard.id], present: checked } })} /></td><td className="whitespace-pre-line p-3 text-muted-foreground">{hazard.controls}</td><td className="p-3"><Check label="" checked={values.hazards[hazard.id]?.controlled ?? false} disabled={viewOnly} onChange={(checked) => update("hazards", { ...values.hazards, [hazard.id]: { ...values.hazards[hazard.id], controlled: checked } })} /></td></tr>)}</tbody></table></div></section>
          <section className="rounded-xl border border-border-subtle p-4"><label className="block text-sm font-bold">Hazard notes<span className="mt-1 block text-xs font-normal text-muted-foreground">Describe any hazard that cannot be controlled, or record the response.</span><textarea className={`${textClass} mt-2`} value={values.hazardNotes} disabled={viewOnly} onChange={(event) => update("hazardNotes", event.target.value)} /></label></section>
          <section className="rounded-xl border border-border-subtle p-4"><h3 className="font-bold">Stud width and comments</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="GF walls" value={values.studWidths.gfWalls} disabled={viewOnly} onChange={(value) => update("studWidths", { ...values.studWidths, gfWalls: value })} /><Field label="FF walls" value={values.studWidths.ffWalls} disabled={viewOnly} onChange={(value) => update("studWidths", { ...values.studWidths, ffWalls: value })} /><Field label="Ceiling spacing" value={values.studWidths.ceilingSpacing} disabled={viewOnly} onChange={(value) => update("studWidths", { ...values.studWidths, ceilingSpacing: value })} /><Field label="Sub floor" value={values.studWidths.subFloor} disabled={viewOnly} onChange={(value) => update("studWidths", { ...values.studWidths, subFloor: value })} /><Field label="Mid floor" value={values.studWidths.midFloor} disabled={viewOnly} onChange={(value) => update("studWidths", { ...values.studWidths, midFloor: value })} /></div><label className="mt-4 block text-sm font-bold">Comments<textarea className={`${textClass} mt-2`} value={values.comments} disabled={viewOnly} onChange={(event) => update("comments", event.target.value)} /></label></section>
          <section className="rounded-xl border border-border-subtle p-4"><h3 className="font-bold">Installer sign-off</h3><p className="mt-1 text-sm text-muted-foreground">Enter each installer who has reviewed the SWMS. Signature capture can be added with the PDF export step.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{values.installerNames.map((name, index) => <Field key={index} label={`Installer ${index + 1}`} value={name} disabled={viewOnly} onChange={(value) => update("installerNames", values.installerNames.map((item, itemIndex) => itemIndex === index ? value : item))} />)}<Field label="Job status" value={values.jobStatus} disabled={viewOnly} onChange={(value) => update("jobStatus", value)} /><Field label="Time out" type="time" value={values.timeOut} disabled={viewOnly} onChange={(value) => update("timeOut", value)} /></div></section>
          <ChecklistSection title="Photos" items={template.photoChecklist} values={values.photoChecklist} disabled={viewOnly} onChange={(id, checked) => update("photoChecklist", { ...values.photoChecklist, [id]: checked })} extra={<><label className="block text-sm font-semibold">Photo notes<textarea className={`${textClass} mt-2`} value={values.photoNotes} disabled={viewOnly} onChange={(event) => update("photoNotes", event.target.value)} /></label>{photoDocs.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{photoDocs.map((photo) => <a key={photo.id} href={photo.url ?? "#"} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle px-3 text-sm font-semibold hover:border-primary hover:text-primary"><Camera className="size-4" />{photo.name}</a>)}</div> : null}</>} />
          {!viewOnly ? <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4"><Button type="submit" variant="primary" disabled={pending}><Save className="size-4" />{pending ? "Saving…" : "Save SWMS"}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>{state.message ? <span className="text-sm font-semibold text-[var(--tone-rose-fg)]">{state.message}</span> : null}</div> : null}
        </form>
        {!viewOnly ? <div className="mt-5 border-t border-border-subtle pt-5"><PhotoUpload projectId={project.id} onUploaded={(id) => setPhotoIds((current) => current.includes(id) ? current : [...current, id])} /></div> : null}
      </div>
    </div>
  </div>, document.body);
}

function PhotoUpload({ projectId, onUploaded }: { projectId: string; onUploaded: (id: string) => void }) {
  const [state, action, pending] = useActionState(uploadSwmsPhotoAction, initial);
  useEffect(() => { if (state.ok && state.documentId) onUploaded(state.documentId); }, [state, onUploaded]);
  return <form action={action} className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border-strong bg-surface-muted p-4"><input type="hidden" name="projectId" value={projectId} /><label className="min-w-48 flex-1 text-sm font-semibold">Add a SWMS photo<span className="mt-1 block text-xs font-normal text-muted-foreground">Stored in this project&apos;s SharePoint Site Photos folder. Up to 4 MB.</span><input required type="file" name="file" accept="image/*" capture="environment" className="mt-2 block w-full text-sm" /></label><Button type="submit" variant="secondary" disabled={pending}><Camera className="size-4" />{pending ? "Uploading…" : "Upload photo"}</Button>{state.message ? <span className={state.ok ? "w-full text-sm font-semibold text-emerald-600" : "w-full text-sm font-semibold text-[var(--tone-rose-fg)]"}>{state.message}</span> : null}</form>;
}

function ChecklistSection({ title, items, values, disabled, onChange, extra }: { title: string; items: Array<{ id: string; label: string }>; values: Record<string, boolean>; disabled: boolean; onChange: (id: string, checked: boolean) => void; extra?: React.ReactNode }) {
  return <section className="rounded-xl border border-border-subtle p-4"><h3 className="font-bold">{title}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <Check key={item.id} label={item.label} checked={values[item.id] ?? false} disabled={disabled} onChange={(checked) => onChange(item.id, checked)} />)}</div>{extra ? <div className="mt-4 border-t border-border-subtle pt-4">{extra}</div> : null}</section>;
}
function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) { return <label className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm ${label ? "hover:bg-surface-muted" : "justify-center"}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-5 shrink-0 accent-[var(--primary)]" /><span>{label}</span></label>; }
function Field({ label, value, disabled, onChange, type = "text" }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm font-semibold">{label}<input type={type} className={`${inputClass} mt-1`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) { return <Field label={label} value={value} disabled={disabled} onChange={onChange} />; }
function toLocalDateTime(value: string): string { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
