import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { getCustomer, listPeople, listProjects } from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Field, PageHeader, Stat } from "@/components/ui";
import { ProjectRow } from "@/components/projects/project-row";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const customer = await getCustomer(session.org.id, id);
  if (!customer) notFound();

  const [projects, people] = await Promise.all([
    listProjects(session.org.id, { customerId: id }),
    listPeople(session.org.id),
  ]);
  const showFinancials = can(session.role, "finance.view");

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

      <PageHeader title={customer.name} description={customer.accountType ?? undefined} />

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
          <CardHeader title="Projects" />
          {projects.length ? (
            <div className="divide-y divide-border-subtle">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} people={people} showFinancials={showFinancials} />
              ))}
            </div>
          ) : (
            <EmptyState title="No projects yet" />
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
          </dl>
        </Card>
      </div>
    </div>
  );
}
