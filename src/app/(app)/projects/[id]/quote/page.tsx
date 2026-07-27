import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { calculateQuote, needsMarginApproval } from "@/lib/domain/quote";
import { getProject, listQuotes } from "@/lib/data/repository";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const QUOTE_TONES = {
  draft: "slate",
  internal_review: "amber",
  approved_internally: "blue",
  sent: "amber",
  accepted: "emerald",
  declined: "rose",
  superseded: "slate",
} as const;

export default async function ProjectQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const quotes = await listQuotes(session.org.id, id);
  const showCosts = can(session.role, "finance.view");
  const latest = quotes[0];

  if (!latest) {
    return (
      <Card>
        <EmptyState
          title="No quote yet"
          description="Build the estimate from labour, materials and supplier costs to move this job to Quote Sent."
        />
      </Card>
    );
  }

  const totals = calculateQuote(latest.lines, latest.taxRatePct);
  const lowMargin = needsMarginApproval(totals);

  return (
    <div className="space-y-4">
      {quotes.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Versions:</span>
          {quotes.map((q) => (
            <Badge key={q.id} tone={QUOTE_TONES[q.status]}>
              v{q.version} · {q.status.replaceAll("_", " ")}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`${latest.reference} · v${latest.version}`}
            description={latest.sentAt ? `Issued ${formatDate(latest.sentAt, true)}` : "Not yet issued"}
            action={<Badge tone={QUOTE_TONES[latest.status]}>{latest.status.replaceAll("_", " ")}</Badge>}
          />

          {/* Table on desktop; stacked cards on mobile, where 6 columns cannot fit. */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  {showCosts ? <th className="px-2 py-2 text-right font-medium">Cost</th> : null}
                  {showCosts ? <th className="px-2 py-2 text-right font-medium">Margin</th> : null}
                  <th className="px-4 py-2 text-right font-medium">Sell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {totals.lines.map((line, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5">
                      <p>{line.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {line.kind}
                        {line.costCurrency !== session.org.currency
                          ? ` · ${line.costCurrency} @ ${line.fxRate}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {line.quantity} {line.unit}
                    </td>
                    {showCosts ? (
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(line.lineCostCents, session.org.currency)}
                      </td>
                    ) : null}
                    {showCosts ? (
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatPercent(line.effectiveMarginPct)}
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {formatMoney(line.lineSellCents, session.org.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border-subtle sm:hidden">
            {totals.lines.map((line, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">{line.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.quantity} {line.unit} · {line.kind}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums">
                    {formatMoney(line.lineSellCents, session.org.currency)}
                  </p>
                </div>
                {showCosts ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cost {formatMoney(line.lineCostCents, session.org.currency)} ·{" "}
                    {formatPercent(line.effectiveMarginPct)} margin
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <dl className="space-y-2 text-sm">
              {showCosts ? (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Total cost</dt>
                  <dd className="tabular-nums">{formatMoney(totals.subtotalCostCents, session.org.currency)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotalSellCents, session.org.currency)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>GST ({latest.taxRatePct}%)</dt>
                <dd className="tabular-nums">{formatMoney(totals.taxCents, session.org.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(totals.totalCents, session.org.currency)}</dd>
              </div>
              {showCosts ? (
                <div className="flex justify-between border-t border-border-subtle pt-2">
                  <dt className="text-muted-foreground">Gross margin</dt>
                  <dd className={`tabular-nums font-medium ${lowMargin ? "text-[var(--tone-amber-fg)]" : ""}`}>
                    {formatPercent(totals.marginPct)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {showCosts && lowMargin ? (
              <p className="mt-3 rounded-[var(--radius)] tone-amber px-3 py-2 text-xs">
                Below the 20% minimum margin — needs a second signature before issuing.
              </p>
            ) : null}
          </Card>

          {showCosts ? (
            <Card>
              <CardHeader title="Cost breakdown" />
              <ul className="space-y-2 px-4 py-3">
                {Object.entries(totals.costByKind)
                  .filter(([, cents]) => cents > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([kind, cents]) => (
                    <li key={kind} className="text-sm">
                      <div className="flex justify-between">
                        <span className="capitalize">{kind}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatMoney(cents, session.org.currency)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${(cents / totals.subtotalCostCents) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
