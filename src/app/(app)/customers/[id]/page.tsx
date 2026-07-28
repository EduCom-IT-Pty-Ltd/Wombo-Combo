import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { getCustomer, isCustomerArchived, listCustomerPriceLists, listPeople, listProjectTemplates, listProjects, listQuotes } from "@/lib/data/repository";
import { ButtonLink, Card, CardHeader, EmptyState, Field, Stat } from "@/components/ui";
import { ProjectRow } from "@/components/projects/project-row";
import { CustomerProjectTemplateSelect } from "@/components/customers/customer-project-template-select";
import { CustomerOptions } from "@/components/customers/customer-options";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const customer = await getCustomer(session.org.id, id);
  if (!customer) notFound();

  const [projects, people, projectTemplates, priceLists, archived] = await Promise.all([
    listProjects(session.org.id, { customerId: id }),
    listPeople(session.org.id),
    listProjectTemplates(session.org.id),
    listCustomerPriceLists(session.org.id),
    isCustomerArchived(session.org.id, customer.id),
  ]);
  const quotes = (await Promise.all(projects.map((project) => listQuotes(session.org.id, project.id)))).flat();
  const showFinancials = can(session.role, "finance.view");
  const createProjectHref = `/projects/new?customerId=${customer.id}`;
  const canCreateProject = can(session.role, "project.create") && !archived;

  const won = projects.filter((p) => !["new_request", "quoting", "quote_sent", "awaiting_approval", "lost"].includes(p.status));
  const quoted = projects.filter((p) => ["quote_sent", "awaiting_approval", "approved", "lost"].includes(p.status));
  const winRate = quoted.length
    ? (quoted.filter((p) => p.status !== "lost").length / quoted.length) * 100
    : 0;

  return (
    <div className="space-y-4">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{customer.name}</h1>
            {can(session.role, "customer.manage") ? (
              <CustomerOptions
                customer={customer}
                priceLists={priceLists.map((list) => ({ id: list.id, name: list.name }))}
                projectTemplates={projectTemplates.map((template) => ({ id: template.id, name: template.name }))}
                archived={archived}
              />
            ) : null}
          </div>
          {customer.accountType ? <p className="mt-1 text-sm text-muted-foreground">{customer.accountType}</p> : null}
        </div>
        {canCreateProject ? (
          <ButtonLink href={createProjectHref} variant="primary" className="w-full sm:w-auto">
            <Plus className="size-4" /> Create project
          </ButtonLink>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active projects" value={customer.activeProjects} />
        <Stat label="Total projects" value={projects.length} />
        <Stat
          label="Lifetime value"
          value={showFinancials ? formatMoney(customer.lifetimeValueCents, session.org.currency, { compact: true }) : "—"}
        />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} hint={`${won.length} won`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Projects"
            action={
              canCreateProject ? (
                <ButtonLink href={createProjectHref} size="sm">
                  <Plus className="size-3.5" /> New
                </ButtonLink>
              ) : null
            }
          />
          {projects.length ? (
            <div className="divide-y divide-border-subtle">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} people={people} showFinancials={showFinancials} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No projects yet"
              description={canCreateProject ? `Start the first job for ${customer.name}.` : undefined}
              action={
                canCreateProject ? (
                  <ButtonLink href={createProjectHref} variant="primary">
                    <Plus className="size-4" /> Create project
                  </ButtonLink>
                ) : null
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Account" />
          <dl className="px-4 py-1">
            <Field label="Primary contact">
              {customer.primaryContactName ?? "—"}
              {customer.primaryContactEmail ? (
                <span className="block text-xs text-muted-foreground">{customer.primaryContactEmail}</span>
              ) : null}
              {customer.primaryContactPhone ? (
                <span className="block text-xs text-muted-foreground">{customer.primaryContactPhone}</span>
              ) : null}
            </Field>
            <Field label="ABN">{customer.abn ?? "—"}</Field>
            <Field label="Payment terms">{customer.paymentTermsDays} days</Field>
            <Field label="Sites">{customer.siteCount}</Field>
            <Field label="Default project"><CustomerProjectTemplateSelect customerId={customer.id} initialTemplateId={customer.defaultProjectTemplateId} templates={projectTemplates.map((template) => ({ id: template.id, name: template.name }))} /></Field>
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader title="Quotes" description={`${quotes.length} quote${quotes.length === 1 ? "" : "s"}`} />
        {quotes.length ? <ul className="divide-y divide-border-subtle">{quotes.map((quote) => <li key={quote.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-bold">{quote.reference} · v{quote.version}</p><p className="text-xs text-muted-foreground">{projects.find((project) => project.id === quote.projectId)?.title ?? "Project"} · {quote.status.replaceAll("_", " ")}</p></div><Link href={`/projects/${quote.projectId}/quote`} className="text-xs font-bold text-primary">View quote</Link></li>)}</ul> : <EmptyState title="No quotes yet" />}
      </Card>
    </div>
  );
}
