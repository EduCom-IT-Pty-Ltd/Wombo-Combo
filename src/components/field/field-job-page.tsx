import Link from "next/link";
import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { fieldUserId, getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getOpenTimeEntry, getProject } from "@/lib/data/repository";
import { PROJECT_TABS } from "@/lib/nav";
import { ButtonLink, Card } from "@/components/ui";
import { FieldTimeClock } from "@/components/field/field-time-clock";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectTabTransition } from "@/components/projects/project-tab-transition";
import ProjectOverviewPage from "@/app/(app)/projects/[id]/page";
import ProjectQuotePage from "@/app/(app)/projects/[id]/quote/page";
import ProjectSchedulePage from "@/app/(app)/projects/[id]/schedule/page";
import ProjectFieldPage from "@/app/(app)/projects/[id]/field/page";
import ProjectDocumentsPage from "@/app/(app)/projects/[id]/documents/page";
import ProjectQaPage from "@/app/(app)/projects/[id]/qa/page";
import ProjectCostingPage from "@/app/(app)/projects/[id]/costing/page";
import ProjectActivityPage from "@/app/(app)/projects/[id]/activity/page";

const projectPages = {
  overview: ProjectOverviewPage,
  quote: ProjectQuotePage,
  schedule: ProjectSchedulePage,
  field: ProjectFieldPage,
  documents: ProjectDocumentsPage,
  qa: ProjectQaPage,
  costing: ProjectCostingPage,
  activity: ProjectActivityPage,
};

/** The project workspace, rendered inside the Field area instead of Projects. */
export async function FieldJobPage({ projectId, activeSegment = "field" }: { projectId: string; activeSegment?: string }) {
  const session = await getSession();
  const userId = fieldUserId(session);
  const [project, openEntry] = await Promise.all([getProject(session.org.id, projectId), getOpenTimeEntry(session.org.id, userId)]);
  if (!project) notFound();
  const tabs = PROJECT_TABS.filter((item) => can(session.role, item.capability));
  const Page = projectPages[activeSegment as keyof typeof projectPages];
  if (!Page) notFound();
  const fieldBase = `/field/${project.id}`;

  return <div className="space-y-4"><Link href="/field" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> My field schedule</Link><Card className="overflow-hidden"><div className="border-b border-border-subtle bg-surface-muted px-4 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs text-muted-foreground">{project.projectNumber}</p><h1 className="mt-1 truncate text-xl font-bold">{project.title}</h1><p className="mt-1 text-sm text-muted-foreground">{project.customerName}</p></div><ButtonLink href={`/projects/${project.id}`} size="sm" variant="secondary"><ArrowUpRight className="size-4" /> Project</ButtonLink></div>{project.siteLabel ? <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" />{project.siteLabel}</p> : null}</div><div className="p-4"><FieldTimeClock projectId={project.id} openEntry={openEntry?.projectId === project.id ? openEntry : null} /></div></Card><ProjectTabs projectId={project.id} tabs={tabs} activeSegment={activeSegment} basePath={fieldBase} overviewHref={`${fieldBase}/overview`} /><ProjectTabTransition><Page params={Promise.resolve({ id: project.id })} /></ProjectTabTransition></div>;
}
