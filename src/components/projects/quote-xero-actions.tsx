"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Receipt } from "lucide-react";
import { exportQuoteInvoiceToXero, exportQuoteToXero } from "@/app/actions/xero";
import { Button } from "@/components/ui";
import type { QuoteSummary } from "@/lib/data/types";

/**
 * The Xero half of a quote's lifecycle: send it across as a draft quote, then
 * bill that same quote when the job is done.
 *
 * Both steps stop at DRAFT in Xero. Approving and sending stays a decision
 * someone makes while looking at the document, which is the only place the
 * consequences of getting it wrong are visible.
 */
export function QuoteXeroActions({
  projectId,
  quote,
  canInvoice,
}: {
  projectId: string;
  quote: QuoteSummary;
  canInvoice: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();
  const inXero = Boolean(quote.xeroQuoteNumber);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        {inXero ? (
          <span className="text-xs font-semibold text-muted-foreground">Xero {quote.xeroQuoteNumber}</span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => exportQuoteToXero(quote.id))}
          >
            <FileUp className="size-3.5" aria-hidden />
            {pending ? "Sending…" : "Send to Xero"}
          </Button>
        )}
        {inXero && canInvoice ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => exportQuoteInvoiceToXero(projectId, quote.id))}
          >
            <Receipt className="size-3.5" aria-hidden />
            {pending ? "Invoicing…" : "Invoice in Xero"}
          </Button>
        ) : null}
      </span>
      {result ? (
        <span className={`text-xs ${result.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>
          {result.message}
        </span>
      ) : quote.xeroLastError && !inXero ? (
        <span className="text-xs text-[var(--tone-rose-fg)]">Last attempt failed: {quote.xeroLastError}</span>
      ) : null}
    </span>
  );
}
