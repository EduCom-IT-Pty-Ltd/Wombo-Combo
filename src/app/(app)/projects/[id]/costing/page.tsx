import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { getCosting, getProject } from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui";

export default async function ProjectCostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!can(session.role, "finance.view")) {
    return (
      <Card>
        <EmptyState title="Not available" description="Your role does not have access to job costing." />
      </Card>
    );
  }

  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const costing = await getCosting(session.org.id, project);
  const currency = session.org.currency;
  const overBudget = costing.costVarianceCents > 0;

  const rows = [
    { label: "Labour", cost: costing.actualLabourCostCents, note: `${costing.actualLabourHours.toFixed(1)} hours` },
    { label: "Materials", cost: costing.actualMaterialCostCents, note: "Recorded on site" },
    { label: "Variations", cost: costing.variationCostCents, note: "Approved only" },
  ];

  return (
    <div className="space-y-4">
      {!costing.hasCostData ? (
        <p className="rounded-[var(--radius)] tone-amber px-4 py-3 text-sm">
          No labour or materials have been captured against this job yet, so the figures below are quoted values
          only — not achieved performance.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue" value={formatMoney(costing.totalRevenueCents, currency, { compact: true })} hint="Contract + variations" />
        <Stat
          label="Cost"
          value={formatMoney(costing.totalCostCents, currency, { compact: true })}
          hint={`${overBudget ? "+" : ""}${formatMoney(costing.costVarianceCents, currency, { compact: true })} vs quoted`}
          tone={overBudget ? "warn" : "good"}
        />
        <Stat
          label="Gross profit"
          value={formatMoney(costing.grossProfitCents, currency, { compact: true })}
          tone={costing.grossProfitCents > 0 ? "good" : "warn"}
        />
        <Stat
          label="Gross margin"
          value={formatPercent(costing.grossMarginPct)}
          hint={`${costing.marginVariancePts >= 0 ? "+" : ""}${costing.marginVariancePts.toFixed(1)}pts vs quoted`}
          tone={costing.marginVariancePts >= 0 ? "good" : "warn"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Actual cost breakdown" />
          <ul className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <li key={row.label} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.note}</p>
                  </div>
                  <p className="text-sm tabular-nums">{formatMoney(row.cost, currency)}</p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{
                      width: `${costing.totalCostCents ? (row.cost / costing.totalCostCents) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 px-4 py-3 font-medium">
              <span className="text-sm">Total cost</span>
              <span className="text-sm tabular-nums">{formatMoney(costing.totalCostCents, currency)}</span>
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Quoted vs actual" />
          <dl className="px-4 py-3 text-sm">
            <div className="flex justify-between border-b border-border-subtle py-2">
              <dt className="text-muted-foreground">Contract value</dt>
              <dd className="tabular-nums">{formatMoney(project.contractValueCents, currency)}</dd>
            </div>
            <div className="flex justify-between border-b border-border-subtle py-2">
              <dt className="text-muted-foreground">Approved variations</dt>
              <dd className="tabular-nums">{formatMoney(costing.variationSellCents, currency)}</dd>
            </div>
            <div className="flex justify-between border-b border-border-subtle py-2 font-medium">
              <dt>Total revenue</dt>
              <dd className="tabular-nums">{formatMoney(costing.totalRevenueCents, currency)}</dd>
            </div>
            <div className="flex justify-between border-b border-border-subtle py-2">
              <dt className="text-muted-foreground">Quoted margin</dt>
              <dd className="tabular-nums">{formatPercent(project.quotedMarginPct)}</dd>
            </div>
            <div className="flex justify-between py-2 font-medium">
              <dt>Achieved margin</dt>
              <dd
                className={`tabular-nums ${costing.marginVariancePts >= 0 ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-amber-fg)]"}`}
              >
                {formatPercent(costing.grossMarginPct)}
              </dd>
            </div>
          </dl>
          <p className="border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground">
            Costing is a live calculation until the project moves to Ready for Invoice, at which point it is
            snapshotted and exported to Xero.
          </p>
        </Card>
      </div>
    </div>
  );
}
