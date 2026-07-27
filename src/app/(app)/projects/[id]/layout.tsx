import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { getProject, isProjectArchived, listCustomers, listWorkflowFields, listWorkflowTasks } from "@/lib/data/repository";
import { PROJECT_TABS } from "@/lib/nav";
import { StatusBadge, StatusStepper } from "@/components/status-badge";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectOptions } from "@/components/projects/project-options";
import { ProjectTabTransition } from "@/components/projects/project-tab-transition";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  return { title: project ? `${project.projectNumber} · ${project.title}` : "Project" };
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const tabs = PROJECT_TABS.filter((t) => can(session.role, t.capability));
  const showFinancials = can(session.role, "finance.view");
  const [workflowTasks, workflowFields, customers, archived] = await Promise.all([
    listWorkflowTasks(session.org.id, project.id, project.status),
    listWorkflowFields(session.org.id, project.id, project.status),
    listCustomers(session.org.id),
    isProjectArchived(session.org.id, project.id),
  ]);

  return (
    <div className="space-y-4">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Projects
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{project.projectNumber}</span>
              <StatusBadge status={project.status} />
              {project.status === "on_hold" && project.heldFromStatus ? (
                <span className="text-xs text-muted-foreground">
                  held from {project.heldFromStatus.replaceAll("_", " ")}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-1"><h1 className="text-lg font-semibold tracking-tight sm:text-xl">{project.title}</h1>{can(session.role, "project.edit") ? <ProjectOptions project={project} customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))} archived={archived} /> : null}</div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <Link href={`/customers/${project.customerId}`} className="hover:text-foreground">
                {project.customerName}
              </Link>
              {project.siteLabel ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" /> {project.siteLabel}
                </span>
              ) : null}
            </p>
          </div>

          {showFinancials && project.contractValueCents > 0 ? (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Contract value</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMoney(project.contractValueCents, session.org.currency)}
              </p>
              <p className="text-xs text-muted-foreground">{project.quotedMarginPct.toFixed(1)}% quoted margin</p>
            </div>
          ) : null}
        </div>

        <StatusStepper status={project.status} projectId={project.id} tasks={workflowTasks} fields={workflowFields} canEdit={can(session.role, "project.edit")} />
      </div>

      <ProjectTabs projectId={project.id} tabs={tabs} />

      <ProjectTabTransition>{children}</ProjectTabTransition>
    </div>
  );
}
