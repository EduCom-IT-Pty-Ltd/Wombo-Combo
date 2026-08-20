import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { listArchivedCustomers, listCustomers, listCustomersForPortalPresentation } from "@/lib/data/repository";
import { ButtonLink, PageHeader } from "@/components/ui";
import { CustomerXeroSyncButton } from "@/components/customers/xero-sync-button";
import { XeroCleanupButton } from "@/components/customers/xero-cleanup";
import { CustomerList } from "@/components/customers/customer-list";
import { CustomerPresentationManager } from "@/components/customers/customer-presentation-manager";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const archived = params.archived === "1";
  const canManage = can(session.role, "customer.manage", session.permissionOverrides);
  const [customers, presentationCustomers] = await Promise.all([
    archived ? listArchivedCustomers(session.org.id) : listCustomers(session.org.id),
    !archived && canManage ? listCustomersForPortalPresentation(session.org.id) : Promise.resolve([]),
  ]);
  const showFinancials = can(session.role, "finance.revenue.view", session.permissionOverrides);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description={`${customers.length} ${archived ? "archived " : ""}accounts, kept in step with Xero`}
        action={canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Clean-up only makes sense against the active list; the archived
                view is where its results land. */}
            {archived ? null : <XeroCleanupButton />}
            <CustomerXeroSyncButton />
            <ButtonLink href="/customers/new" variant="primary" size="sm">Add customer</ButtonLink>
          </div>
        ) : null}
      />

      <div className="flex gap-2"><Link href="/customers" className={`rounded-full px-4 py-2 text-sm font-bold ${!archived ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground"}`}>Active</Link><Link href="/customers?archived=1" className={`rounded-full px-4 py-2 text-sm font-bold ${archived ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground"}`}>Archived</Link></div>

      {!archived && canManage ? <CustomerPresentationManager customers={presentationCustomers} /> : null}

      <CustomerList
        customers={customers}
        currency={session.org.currency}
        showFinancials={showFinancials}
        archived={archived}
      />
    </div>
  );
}
