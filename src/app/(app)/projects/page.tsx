import Link from "next/link";
import { ArrowUpRight, Clock3, Plus } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { listPeople, listProjects } from "@/lib/data/repository";
import { readStatusSettings } from "@/lib/data/local-store";
import type { ProjectSummary } from "@/lib/data/types";
import { orderedFlow } from "@/lib/domain/status-settings";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProjectRow } from "@/components/projects/project-row";
import { StatusBadge } from "@/components/status-badge";
import { cn, formatRelative } from "@/lib/utils";

export const metadata = { title: "Projects" };

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "lost", label: "Lost" },
  { key: "complete", label: "Complete" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function matchesFilter(project: ProjectSummary, filter: FilterKey) {
  if (filter === "active") return !["closed", "lost", "cancelled"].includes(project.status);
  if (filter === "complete") return project.status === "closed";
  return project.status === filter;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const params = await searchParams;
  const filter = FILTERS.some((item) => item.key === params.group) ? params.group as FilterKey : "active";
  const session = await getSession();
  const showFinancials = can(session.role, "finance.view");
  const [allProjects, people, statusSettings] = await Promise.all([
    listProjects(session.org.id),
    listPeople(session.org.id),
    readStatusSettings(),
  ]);
  const projects = allProjects.filter((project) => matchesFilter(project, filter));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description={`${projects.length} ${filter === "active" ? "active " : ""}${projects.length === 1 ? "project" : "projects"}`}
        action={can(session.role, "project.create") ? <ButtonLink href="/projects/new" variant="primary" size="sm"><Plus className="size-4" /> New request</ButtonLink> : null}
      />

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Project filters">
        {FILTERS.map((item) => <Link key={item.key} href={item.key === "active" ? "/projects" : `/projects?group=${item.key}`} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors", filter === item.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-surface-muted text-muted-foreground hover:bg-surface hover:text-foreground")}>{item.label}</Link>)}
      </nav>

      {projects.length === 0 ? <Card><EmptyState title={`No ${filter} projects`} description="There is nothing in this view yet." /></Card> : filter === "active" ? <ActiveProjectBoard projects={projects} statusSettings={statusSettings} /> : <ProjectList projects={projects} people={people} showFinancials={showFinancials} />}
    </div>
  );
}

function ActiveProjectBoard({ projects, statusSettings }: { projects: ProjectSummary[]; statusSettings: Awaited<ReturnType<typeof readStatusSettings>> }) {
  const flow = orderedFlow(statusSettings);
  const known = new Set(flow.map((setting) => setting.status));
  const unknownStatuses = [...new Set(projects.filter((project) => !known.has(project.status)).map((project) => project.status))];
  const sections = [
    ...flow.map((setting) => ({ status: setting.status, label: setting.label, color: setting.color, projects: projects.filter((project) => project.status === setting.status) })),
    ...unknownStatuses.map((status) => ({ status, label: status.replaceAll("_", " "), color: "#64748b", projects: projects.filter((project) => project.status === status) })),
  ].filter((section) => section.projects.length > 0);

  return <div className="space-y-7">{sections.map((section) => <section key={section.status}><div className="mb-3 flex items-center gap-2"><StatusBadge status={section.status} /><span className="text-xs font-bold text-muted-foreground">{section.projects.length}</span><span className="h-px flex-1 bg-border-subtle" /></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{section.projects.map((project) => <ActiveProjectTile key={project.id} project={project} color={section.color} />)}</div></section>)}</div>;
}

function ActiveProjectTile({ project, color }: { project: ProjectSummary; color: string }) {
  return <Link href={`/projects/${project.id}`} className="group relative flex aspect-square flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"><span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: color }} /><div className="flex items-start justify-between gap-2"><span className="font-mono text-[11px] text-muted-foreground">{project.projectNumber}</span><ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div><div className="mt-4"><p className="line-clamp-3 text-base font-bold leading-snug">{project.title}</p><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.customerName}</p></div><div className="mt-auto border-t border-border-subtle pt-3"><span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Clock3 className="size-3" />{formatRelative(project.updatedAt)}</span></div></Link>;
}

function ProjectList({ projects, people, showFinancials }: { projects: ProjectSummary[]; people: Awaited<ReturnType<typeof listPeople>>; showFinancials: boolean }) {
  return <Card><div className="divide-y divide-border-subtle">{projects.map((project) => <ProjectRow key={project.id} project={project} people={people} showFinancials={showFinancials} />)}</div></Card>;
}
