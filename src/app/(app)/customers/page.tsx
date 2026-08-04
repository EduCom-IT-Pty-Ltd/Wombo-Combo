import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { listArchivedCustomers, listCustomers } from "@/lib/data/repository";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { CustomerXeroSyncButton } from "@/components/customers/xero-sync-button";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const archived = params.archived === "1";
  const customers = archived ? await listArchivedCustomers(session.org.id) : await listCustomers(session.org.id);
  const showFinancials = can(session.role, "finance.revenue.view", session.permissionOverrides);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description={`${customers.length} ${archived ? "archived " : ""}accounts, kept in step with Xero`}
        action={can(session.role, "customer.manage", session.permissionOverrides) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CustomerXeroSyncButton />
            <ButtonLink href="/customers/new" variant="primary" size="sm">Add customer</ButtonLink>
          </div>
        ) : null}
      />

      <div className="flex gap-2"><Link href="/customers" className={`rounded-full px-4 py-2 text-sm font-bold ${!archived ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground"}`}>Active</Link><Link href="/customers?archived=1" className={`rounded-full px-4 py-2 text-sm font-bold ${archived ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground"}`}>Archived</Link></div>

      <Card>
        {customers.length ? (
          <ul className="divide-y divide-border-subtle">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.accountType} · {c.siteCount} sites · {c.activeProjects} active
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {showFinancials ? (
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(c.lifetimeValueCents, session.org.currency, { compact: true })}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{c.paymentTermsDays} day terms</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No customers yet" />
        )}
      </Card>
    </div>
  );
}
