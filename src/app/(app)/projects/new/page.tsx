import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { listCustomers, listProjectTemplates } from "@/lib/data/repository";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { NewRequestForm } from "@/components/projects/new-request-form";

export const metadata = { title: "New request" };

export default async function NewProjectPage() {
  const session = await getSession();

  if (!can(session.role, "project.create")) {
    return (
      <Card>
        <EmptyState title="Not available" description="Your role cannot create projects." />
      </Card>
    );
  }

  const [customers, templates] = await Promise.all([listCustomers(session.org.id), listProjectTemplates(session.org.id)]);

  return (
    <div className="space-y-4">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Projects
      </Link>

      <PageHeader
        title="New project"
        description="Choose Standard project or a template to begin at the right workflow stage."
      />

      <NewRequestForm customers={customers.map((c) => ({ id: c.id, name: c.name, defaultProjectTemplateId: c.defaultProjectTemplateId ?? null }))} templates={templates} />
    </div>
  );
}
