import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { getCosting, getLabourSettings, getProject, getProjectCostingOptions } from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { ProjectCostingOptionsForm } from "@/components/projects/project-costing-options";

function signedMoney(cents: number, currency: string) { return `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${formatMoney(Math.abs(cents), currency)}`; }

export default async function ProjectCostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!can(session.role, "finance.profit.view", session.permissionOverrides)) return <Card><EmptyState title="Not available" description="Your role does not have access to job costing." /></Card>;
  const project = await getProject(session.org.id, id);
  if (!project) notFound();
  const [costing, labourSettings, costingOptions] = await Promise.all([getCosting(session.org.id, project), getLabourSettings(session.org.id), getProjectCostingOptions(session.org.id, id)]);
  const currency = session.org.currency;
  const profitable = costing.grossProfitCents >= 0;
  const labourOverBudget = costing.labourVarianceCents > 0;
  const canManage = can(session.role, "finance.manage", session.permissionOverrides);
  return <div className="space-y-4">
    {canManage ? <ProjectCostingOptionsForm projectId={id} settings={labourSettings} options={costingOptions} /> : null}
    {!costing.hasCostData ? <Card><EmptyState title="No costing data yet" description="Generate a materials quote, then add labour or subcontractor options to calculate job costs." /></Card> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Quote revenue" value={formatMoney(costing.totalRevenueCents, currency)} hint="Latest quote, excluding GST" />
        <Stat label="Material cost" value={formatMoney(costing.actualMaterialCostCents, currency)} hint="Quoted materials" />
        <Stat label="Labour budget" value={formatMoney(costing.budgetedLabourCostCents, currency)} hint="Standard labour" />
        <Stat label="Actual labour" value={formatMoney(costing.actualLabourCostCents, currency)} hint={`${costing.actualLabourHours.toFixed(1)} logged hours`} />
        <Stat label="Subcontractor materials" value={formatMoney(costing.subcontractorMaterialCostCents, currency)} hint="Quoted m² × sub rate" />
        <Stat label="Gross profit" value={formatMoney(costing.grossProfitCents, currency)} tone={profitable ? "good" : "warn"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="Labour & subcontractor costing" description="Actual labour comes from completed Field clock entries." /><dl className="px-4 py-3 text-sm"><div className="flex justify-between border-b border-border-subtle py-2"><dt className="text-muted-foreground">Budgeted labour</dt><dd className="tabular-nums">{formatMoney(costing.budgetedLabourCostCents, currency)}</dd></div><div className="flex justify-between border-b border-border-subtle py-2"><dt className="text-muted-foreground">Actual labour ({costing.actualLabourHours.toFixed(1)}h)</dt><dd className="tabular-nums">{formatMoney(costing.actualLabourCostCents, currency)}</dd></div><div className="flex justify-between border-b border-border-subtle py-2"><dt className="text-muted-foreground">Labour variance</dt><dd className={`tabular-nums font-bold ${labourOverBudget ? "text-rose-600" : "text-emerald-600"}`}>{signedMoney(costing.labourVarianceCents, currency)} {costing.labourVarianceCents > 0 ? "over" : costing.labourVarianceCents < 0 ? "under" : "on budget"}</dd></div><div className="flex justify-between border-b border-border-subtle py-2"><dt className="text-muted-foreground">Sub contractor Material Cost</dt><dd className="tabular-nums">{formatMoney(costing.subcontractorMaterialCostCents, currency)}</dd></div><div className="flex justify-between py-2 font-bold"><dt>Updated gross profit</dt><dd className="tabular-nums">{formatMoney(costing.grossProfitCents, currency)}</dd></div></dl></Card><Card><CardHeader title="How this is calculated" /><div className="space-y-3 px-4 py-4 text-sm text-muted-foreground"><p><span className="font-semibold text-foreground">Revenue</span> is the latest quote subtotal, excluding GST.</p><p><span className="font-semibold text-foreground">Actual labour</span> is completed Field time × each employee’s hourly rate captured when they clocked in.</p><p><span className="font-semibold text-foreground">Labour budget</span> is the standard per-job labour cost × the employee count set above.</p><p><span className="font-semibold text-foreground">Sub contractor Material Cost</span> is latest quoted m² × the matching Labour-module subcontractor rate. It is deducted in the gross profit above only when enabled for this project.</p><p><span className="font-semibold text-foreground">Gross margin</span> is {formatPercent(costing.grossMarginPct)} after material, actual labour and enabled subcontractor costs.</p></div></Card></div>
    </>}
  </div>;
}
