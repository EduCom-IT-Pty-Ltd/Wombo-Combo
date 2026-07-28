import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { getCosting, getProject } from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui";

/** A deliberately simple view: latest quote revenue less its material cost. */
export default async function ProjectCostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!can(session.role, "finance.view")) {
    return <Card><EmptyState title="Not available" description="Your role does not have access to job costing." /></Card>;
  }

  const project = await getProject(session.org.id, id);
  if (!project) notFound();
  const costing = await getCosting(session.org.id, project);
  const currency = session.org.currency;
  const profitable = costing.grossProfitCents >= 0;

  if (!costing.hasCostData) {
    return <Card><EmptyState title="No quote to cost yet" description="Generate a materials quote first. Its quoted value and material costs will appear here automatically." /></Card>;
  }

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Quote revenue" value={formatMoney(costing.totalRevenueCents, currency, { compact: true })} hint="Latest quote, excluding GST" />
      <Stat label="Material cost" value={formatMoney(costing.actualMaterialCostCents, currency, { compact: true })} hint="Materials on that quote" />
      <Stat label="Gross profit" value={formatMoney(costing.grossProfitCents, currency, { compact: true })} tone={profitable ? "good" : "warn"} />
      <Stat label="Gross margin" value={formatPercent(costing.grossMarginPct)} tone={profitable ? "good" : "warn"} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Quote-based costing" description="Financials are calculated only from the latest generated materials quote." />
        <dl className="px-4 py-3 text-sm">
          <div className="flex justify-between border-b border-border-subtle py-2"><dt className="text-muted-foreground">Quote revenue</dt><dd className="tabular-nums">{formatMoney(costing.totalRevenueCents, currency)}</dd></div>
          <div className="flex justify-between border-b border-border-subtle py-2"><dt className="text-muted-foreground">Material cost</dt><dd className="tabular-nums">{formatMoney(costing.actualMaterialCostCents, currency)}</dd></div>
          <div className="flex justify-between py-2 font-bold"><dt>Gross profit</dt><dd className="tabular-nums">{formatMoney(costing.grossProfitCents, currency)}</dd></div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="How this is calculated" />
        <div className="space-y-3 px-4 py-4 text-sm text-muted-foreground">
          <p><span className="font-semibold text-foreground">Revenue</span> is the latest quote subtotal, excluding GST.</p>
          <p><span className="font-semibold text-foreground">Cost</span> is the quantity × cost price of every material on that quote.</p>
          <p><span className="font-semibold text-foreground">Gross profit</span> is revenue less material cost. Labour and variations are not included in this simplified project costing view.</p>
        </div>
      </Card>
    </div>
  </div>;
}
