"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FileUp } from "lucide-react";
import { exportInvoiceToXero, type ExportedInvoice } from "@/app/actions/xero";
import { Button } from "@/components/ui";

/**
 * Per-project invoice export.
 *
 * The action is idempotent, so a double click cannot produce two invoices — but
 * the button is disabled while pending anyway, because a user who sees nothing
 * happen will click again and deserves to be told what is going on.
 */
export function XeroExportButton({ projectId, exported }: { projectId: string; exported: ExportedInvoice | null }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (exported && !result) {
    return exported.url ? (
      <a
        href={exported.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-end gap-1 text-xs font-semibold text-primary underline underline-offset-2 hover:no-underline"
      >
        {exported.number ?? "In Xero"}
        <ExternalLink className="size-3" aria-hidden />
        <span className="sr-only">(opens in Xero)</span>
      </a>
    ) : (
      <span className="text-xs text-muted-foreground">{exported.number ?? "In Xero"}</span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => start(async () => setResult(await exportInvoiceToXero(projectId)))}
      >
        <FileUp className="size-3.5" aria-hidden />
        {pending ? "Sending…" : "Send to Xero"}
      </Button>
      {result ? (
        <span className={`text-xs ${result.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>
          {result.message}
        </span>
      ) : null}
    </span>
  );
}
