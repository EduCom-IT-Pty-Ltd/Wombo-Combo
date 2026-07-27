import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { listCustomers } from "@/lib/data/repository";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const session = await getSession();
  const customers = await listCustomers(session.org.id);
  const showFinancials = can(session.role, "finance.view");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description={`${customers.length} accounts`}
        action={can(session.role, "customer.manage") ? <Button size="sm">Add customer</Button> : null}
      />

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
