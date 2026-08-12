"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Download, ExternalLink, FileCheck2, LoaderCircle } from "lucide-react";
import { exportProjectCertificateAction } from "@/app/actions/certificate";
import type { DocumentRecord, ProjectDetail } from "@/lib/data/types";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export function ProjectCertificate({ project, certificate, canGenerate, hasHeader, canView }: { project: ProjectDetail; certificate: DocumentRecord | null; canGenerate: boolean; hasHeader: boolean; canView: boolean }) {
  const [exporting, startExport] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ id: string; url: string } | null>(certificate?.url ? { id: certificate.id, url: certificate.url } : null);
  const exportCertificate = () => startExport(async () => {
    setMessage(null);
    const result = await exportProjectCertificateAction(project.id);
    setMessage(result.message ?? null);
    if (!result.ok || !result.documentId || !result.downloadUrl || !result.viewUrl) return;
    setCurrent({ id: result.documentId, url: result.viewUrl });
    const frame = document.createElement("iframe");
    frame.className = "hidden";
    frame.title = "Certificate PDF download";
    frame.src = result.downloadUrl;
    document.body.append(frame);
    window.setTimeout(() => frame.remove(), 60_000);
  });

  return <Card className="overflow-hidden"><CardHeader title="Certificate of Compliance" description="Generate the current compliance certificate from project details, store it in SharePoint and download a copy." action={canGenerate && hasHeader ? <Button size="sm" variant="primary" disabled={exporting} onClick={exportCertificate}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{exporting ? "Generating…" : "Export certificate"}</Button> : null} />
    {!hasHeader ? <div className="border-t border-border-subtle p-4"><EmptyState title="Certificate header required" description="An administrator needs to upload the Certificate Header in Settings → Organisation before a certificate can be generated." /></div> : <div className="space-y-4 border-t border-border-subtle p-4"><div className="rounded-xl border border-border-subtle bg-surface-muted p-4"><div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-semibold">Certificate reference: {project.projectNumber}-CERT</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">The certificate records the project, customer, site address, issue date and a fixed compliance statement. Re-exporting replaces the current SharePoint PDF while retaining a new document-register version and activity entry.</p></div></div></div>{current ? <div className="flex flex-wrap items-center gap-3"><Badge tone="emerald"><CheckCircle2 className="size-3" />Certificate available</Badge>{certificate ? <span className="text-xs text-muted-foreground">Last exported {formatDate(certificate.uploadedAt, true)}</span> : null}{canView ? <a href={current.url} target="_blank" rel="noreferrer" className="button-base-pop button-secondary-pop inline-flex h-8 items-center justify-center gap-2 rounded-[var(--radius)] px-3 text-xs font-medium"><ExternalLink className="size-4" />View PDF</a> : null}</div> : <p className="text-sm text-muted-foreground">No certificate has been exported for this project yet.</p>}{message ? <p className={message.startsWith("Certificate exported") ? "text-sm font-semibold text-[var(--tone-emerald-fg)]" : "text-sm font-semibold text-[var(--tone-rose-fg)]"}>{message}</p> : null}</div>}
  </Card>;
}
