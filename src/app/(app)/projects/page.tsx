import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getStatusSettings, listArchivedProjects, listPeople, listProjectTemplates, listProjects } from "@/lib/data/repository";
import type { ProjectSummary } from "@/lib/data/types";
import { orderedFlow } from "@/lib/domain/status-settings";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProjectRow } from "@/components/projects/project-row";
import { ProjectTemplateDialog } from "@/components/projects/project-template-dialog";
import { cn } from "@/lib/utils";
import { ActiveProjectBoard } from "@/components/projects/active-project-board";

export const metadata = { title: "Projects" };

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "lost", label: "Lost" },
  { key: "complete", label: "Complete" },
  { key: "cancelled", label: "Cancelled" },
  { key: "archived", label: "Archived" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function matchesFilter(project: ProjectSummary, filter: FilterKey) {
  if (filter === "archived") return false;
  if (filter === "active") return !["closed", "lost", "cancelled"].includes(project.status);
  if (filter === "complete") return project.status === "closed";
  return project.status === filter;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const params = await searchParams;
  const filter = FILTERS.some((item) => item.key === params.group) ? params.group as FilterKey : "active";
  const session = await getSession();
  const showFinancials = can(session.role, "finance.revenue.view", session.permissionOverrides);
  // Only the list this tab renders. Loading both cost seven queries for a
  // result the page threw away, on the screen people open most.
  const showArchived = filter === "archived";
  const [projectsInView, people, statusSettings, projectTemplates] = await Promise.all([
    showArchived ? listArchivedProjects(session.org.id) : listProjects(session.org.id),
    listPeople(session.org.id),
    getStatusSettings(session.org.id),
    listProjectTemplates(session.org.id),
  ]);
  const projects = showArchived ? projectsInView : projectsInView.filter((project) => matchesFilter(project, filter));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description={`${projects.length} ${filter === "active" ? "active " : ""}${projects.length === 1 ? "project" : "projects"}`}
        action={can(session.role, "project.create", session.permissionOverrides) ? <div className="flex gap-2"><ProjectTemplateDialog templates={projectTemplates} statuses={orderedFlow(statusSettings)} /><ButtonLink href="/projects/new" variant="primary" size="sm"><Plus className="size-4" /> New project</ButtonLink></div> : null}
      />

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Project filters">
        {FILTERS.map((item) => <Link key={item.key} href={item.key === "active" ? "/projects" : `/projects?group=${item.key}`} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors", filter === item.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-surface-muted text-muted-foreground hover:bg-surface hover:text-foreground")}>{item.label}</Link>)}
      </nav>

      {projects.length === 0 ? <Card><EmptyState title={`No ${filter} projects`} description="There is nothing in this view yet." /></Card> : filter === "active" ? <ActiveProjectBoard projects={projects} statusSettings={statusSettings} canTransition={can(session.role, "project.transition", session.permissionOverrides)} /> : <ProjectList projects={projects} people={people} showFinancials={showFinancials} />}
    </div>
  );
}

function ProjectList({ projects, people, showFinancials }: { projects: ProjectSummary[]; people: Awaited<ReturnType<typeof listPeople>>; showFinancials: boolean }) {
  return <Card><div className="divide-y divide-border-subtle">{projects.map((project) => <ProjectRow key={project.id} project={project} people={people} showFinancials={showFinancials} />)}</div></Card>;
}
