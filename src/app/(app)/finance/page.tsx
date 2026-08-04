import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { getCostingByProject, getDashboardMetrics, listProjects } from "@/lib/data/repository";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { XeroConnectionPanel } from "@/components/finance/xero-connection";
import { XeroExportButton } from "@/components/finance/xero-export-button";
import { listExportedProjectIds } from "@/app/actions/xero";

export const metadata = { title: "Finance" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string; xeroError?: string }>;
}) {
  const { xero, xeroError } = await searchParams;
  // One query for the whole table rather than one per row.
  const exportedProjectIds = await listExportedProjectIds();
  const session = await getSession();
  const currency = session.org.currency;

  const [metrics, projects] = await Promise.all([
    getDashboardMetrics(session.org.id),
    listProjects(session.org.id),
  ]);

  const readyToInvoice = projects.filter((p) => p.status === "ready_for_invoice");
  const awaitingPo = projects.filter((p) => p.status === "approved" && !p.poNumber);
  const inCosting = projects.filter((p) => p.status === "final_costing");

  // Margin performance on completed jobs — the number that says whether quoting
  // is calibrated to what delivery actually costs.
  //
  // Costed in one batch. The list already carries everything the table renders,
  // so re-reading each project in full to hand it to the costing was buying nine
  // queries a row for its id.
  const completed = projects.filter((p) => ["ready_for_invoice", "closed"].includes(p.status));
  const costingByProject = await getCostingByProject(session.org.id, completed.map((p) => p.id));
  const performance = completed.map((p) => ({ project: p, costing: costingByProject.get(p.id) ?? null }));

  return (
    <div className="space-y-4">
      <PageHeader title="Finance" description="Job costing, invoicing and Xero export" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Work in progress" value={formatMoney(metrics.wipValueCents, currency, { compact: true })} />
        <Stat
          label="Ready to invoice"
          value={formatMoney(metrics.readyToInvoiceCents, currency, { compact: true })}
          hint={`${readyToInvoice.length} jobs`}
          tone={readyToInvoice.length > 0 ? "good" : "default"}
        />
        <Stat
          label="Quotes outstanding"
          value={formatMoney(metrics.quotesOutstandingCents, currency, { compact: true })}
          hint={`${metrics.quotesOutstandingCount} awaiting decision`}
        />
        <Stat
          label="Awaiting PO"
          value={awaitingPo.length}
          hint="Approved, no purchase order"
          tone={awaitingPo.length > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Ready for invoice"
            description="Queued for export to Xero"
            action={<span className="text-xs text-muted-foreground tabular-nums">{readyToInvoice.length}</span>}
          />
          {readyToInvoice.length ? (
            <ul className="divide-y divide-border-subtle">
              {readyToInvoice.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}/costing`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.customerName} · {p.poNumber ?? "no PO"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(p.contractValueCents, currency, { compact: true })}
                      </p>
                      <Badge tone="emerald">Export</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing queued" description="Jobs appear here once final costing is signed off." />
          )}
        </Card>

        <Card>
          <CardHeader title="Needs chasing" description="Approved without a purchase order" />
          {awaitingPo.length || inCosting.length ? (
            <ul className="divide-y divide-border-subtle">
              {[...awaitingPo, ...inCosting].map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.customerName}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="All clear" />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Margin performance" description="Quoted vs achieved on completed jobs" />
        {performance.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Project</th>
                  <th className="px-2 py-2 text-right font-medium">Revenue</th>
                  <th className="px-2 py-2 text-right font-medium">Cost</th>
                  <th className="px-2 py-2 text-right font-medium">Quoted</th>
                  <th className="px-4 py-2 text-right font-medium">Achieved</th>
                  <th className="px-4 py-2 text-right font-medium">Xero</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {performance.map(({ project, costing }) => {
                  const complete = Boolean(costing?.hasCostData);
                  const delta = costing ? costing.grossMarginPct - project.quotedMarginPct : 0;
                  return (
                    <tr key={project.id}>
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${project.id}/costing`} className="hover:text-primary">
                          <span className="font-mono text-xs text-muted-foreground">{project.projectNumber}</span>
                          <span className="block truncate">{project.title}</span>
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {formatMoney(costing?.totalRevenueCents ?? 0, currency, { compact: true })}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                        {complete ? formatMoney(costing!.totalCostCents, currency, { compact: true }) : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatPercent(project.quotedMarginPct)}
                      </td>
                      {complete ? (
                        <td
                          className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                            delta >= 0 ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-amber-fg)]"
                          }`}
                        >
                          {formatPercent(costing!.grossMarginPct)}
                          <span className="block text-xs font-normal">
                            {delta >= 0 ? "+" : ""}
                            {delta.toFixed(1)}pts
                          </span>
                        </td>
                      ) : (
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">No cost captured</td>
                      )}
                      <td className="px-4 py-2.5 text-right">
                        <XeroExportButton projectId={project.id} exported={exportedProjectIds.includes(project.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No completed jobs yet" />
        )}
        <XeroConnectionPanel
          notice={xeroError ? { message: xeroError, ok: false } : xero ? { message: xero, ok: true } : undefined}
        />
      </Card>
    </div>
  );
}
