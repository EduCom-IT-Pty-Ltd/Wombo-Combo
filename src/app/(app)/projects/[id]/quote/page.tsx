import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { calculateQuote } from "@/lib/domain/quote";
import { getProject, getXeroShortCode, listCatalogueMaterials, listCustomerPriceLists, listPeople, listProductionTemplates, listQuotes } from "@/lib/data/repository";
import { xeroQuoteUrl } from "@/lib/integrations/xero/links";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { MaterialQuoteBuilder } from "@/components/projects/material-quote-builder";
import { AddOnsiteQuote } from "@/components/projects/add-onsite-quote";
import { QuoteActions } from "@/components/projects/quote-actions";
import { QuoteXeroActions } from "@/components/projects/quote-xero-actions";

export default async function ProjectQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const session = await getSession(); const project = await getProject(session.org.id, id); if (!project) notFound();
  const [quotes, materials, priceLists, productionTemplates, people, xeroShortCode] = await Promise.all([listQuotes(session.org.id, id), listCatalogueMaterials(session.org.id), listCustomerPriceLists(session.org.id), listProductionTemplates(session.org.id), listPeople(session.org.id), getXeroShortCode(session.org.id)]);
  const priceList = project.customer.priceListId ? priceLists.find((list) => list.id === project.customer.priceListId) ?? null : null;
  const pricedMaterials = materials.map((material) => {
    const customerPrice = priceList?.entries.find((entry) => entry.materialId === material.id)?.priceCentsPerM2;
    return { ...material, quotePriceCentsPerM2: customerPrice ?? material.standardPriceCentsPerM2, usesCustomerPrice: customerPrice !== undefined };
  });
  return <div className="space-y-4">{can(session.role, "schedule.manage", session.permissionOverrides) ? <div className="flex justify-end"><AddOnsiteQuote projectId={project.id} people={people} /></div> : null}{can(session.role, "quote.edit", session.permissionOverrides) ? <MaterialQuoteBuilder projectId={project.id} materials={pricedMaterials} priceListName={priceList?.name ?? null} productionTemplates={productionTemplates} /> : null}{quotes.length ? <Card><CardHeader title="Generated quotes" description="Send a quote to Xero as a draft, then approve and email it from there." /> <div className="divide-y divide-border-subtle">{quotes.map((quote) => { const totals = calculateQuote(quote.lines, quote.taxRatePct); return <div key={quote.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-bold">{quote.reference}</p><p className="text-xs text-muted-foreground">{quote.lines.length} material lines · {formatMoney(totals.totalCents, session.org.currency)}</p></div><div className="flex flex-wrap items-center justify-end gap-2">{can(session.role, "quote.send", session.permissionOverrides) ? <QuoteXeroActions projectId={project.id} quote={quote} canInvoice={can(session.role, "finance.manage", session.permissionOverrides)} xeroUrl={xeroShortCode && quote.xeroQuoteId ? xeroQuoteUrl(xeroShortCode, quote.xeroQuoteId) : null} /> : null}{can(session.role, "quote.edit", session.permissionOverrides) ? <QuoteActions projectId={project.id} quote={quote} materials={pricedMaterials} /> : null}</div></div>; })}</div></Card> : <Card><EmptyState title="No generated quotes" description="Add a production template, then set the material quantities to create the first quote." /></Card>}</div>;
}
