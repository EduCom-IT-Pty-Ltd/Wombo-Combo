import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { NewCustomerForm } from "@/components/customers/new-customer-form";
import { listCustomerPriceLists, listProjectTemplates } from "@/lib/data/repository";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const session = await getSession();
  if (!can(session.role, "customer.manage")) return <Card><EmptyState title="Not available" description="Your role cannot add customers." /></Card>;
  const [priceLists, projectTemplates] = await Promise.all([listCustomerPriceLists(session.org.id), listProjectTemplates(session.org.id)]);
  return <div className="space-y-4"><Link href="/customers" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Customers</Link><PageHeader title="Add customer" description="Create a customer to use on new project requests." /><NewCustomerForm priceLists={priceLists.map((list) => ({ id: list.id, name: list.name }))} projectTemplates={projectTemplates.map((template) => ({ id: template.id, name: template.name }))} /></div>;
}
