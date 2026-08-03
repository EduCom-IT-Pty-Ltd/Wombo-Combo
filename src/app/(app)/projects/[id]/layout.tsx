import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getProject, isProjectArchived, listCustomers, listWorkflowFields, listWorkflowTasks } from "@/lib/data/repository";
import { PROJECT_TABS } from "@/lib/nav";
import { StatusBadge, StatusStepper } from "@/components/status-badge";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectOptions } from "@/components/projects/project-options";
import { ProjectTabTransition } from "@/components/projects/project-tab-transition";
import { readStatusSettings } from "@/lib/data/local-store";

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

  const tabs = PROJECT_TABS.filter((t) => can(session.role, t.capability, session.permissionOverrides));
  const [statusSettings, customers, archived] = await Promise.all([
    readStatusSettings(),
    listCustomers(session.org.id),
    isProjectArchived(session.org.id, project.id),
  ]);
  const workflowStatuses = statusSettings.filter((setting) => setting.inProgressFlow).map((setting) => setting.status);
  if (!workflowStatuses.includes(project.status)) workflowStatuses.push(project.status);
  const workflowEntries = await Promise.all(workflowStatuses.map(async (workflowStatus) => [
    workflowStatus,
    await listWorkflowTasks(session.org.id, project.id, workflowStatus),
    await listWorkflowFields(session.org.id, project.id, workflowStatus),
  ] as const));
  const tasksByStatus = Object.fromEntries(workflowEntries.map(([workflowStatus, tasks]) => [workflowStatus, tasks]));
  const fieldsByStatus = Object.fromEntries(workflowEntries.map(([workflowStatus, , fields]) => [workflowStatus, fields]));

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
            <div className="mt-1 flex items-center gap-1"><h1 className="text-lg font-semibold tracking-tight sm:text-xl">{project.title}</h1>{can(session.role, "project.edit", session.permissionOverrides) ? <ProjectOptions project={project} customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))} archived={archived} canArchive={can(session.role, "project.archive", session.permissionOverrides)} canDelete={can(session.role, "project.delete", session.permissionOverrides)} /> : null}</div>
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

        </div>

        <StatusStepper status={project.status} projectId={project.id} tasksByStatus={tasksByStatus} fieldsByStatus={fieldsByStatus} canEdit={can(session.role, "project.edit", session.permissionOverrides)} />
      </div>

      <ProjectTabs projectId={project.id} tabs={tabs} />

      <ProjectTabTransition>{children}</ProjectTabTransition>
    </div>
  );
}
