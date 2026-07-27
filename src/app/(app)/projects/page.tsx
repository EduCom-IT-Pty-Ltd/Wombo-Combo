import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { PIPELINE_ORDER, STATUS_META, type ProjectStatus } from "@/lib/domain/status";
import { listPeople, listProjects } from "@/lib/data/repository";
import { formatMoney } from "@/lib/domain/money";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProjectRow } from "@/components/projects/project-row";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export const metadata = { title: "Projects" };

const GROUPS: Array<{ key: string; label: string; statuses: ProjectStatus[] }> = [
  { key: "all", label: "All", statuses: [] },
  { key: "sales", label: "Sales", statuses: ["new_request", "quoting", "quote_sent", "awaiting_approval"] },
  { key: "pre_start", label: "Pre-start", statuses: ["approved", "waiting_for_scheduling", "scheduled"] },
  { key: "delivery", label: "On site", statuses: ["in_progress", "installation_complete"] },
  { key: "close_out", label: "Close-out", statuses: ["qa", "final_costing", "ready_for_invoice"] },
  { key: "closed", label: "Closed", statuses: ["closed", "lost", "cancelled", "on_hold"] },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; status?: string; view?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const showFinancials = can(session.role, "finance.view");

  const group = GROUPS.find((g) => g.key === params.group) ?? GROUPS[0];
  const statusFilter = params.status ? [params.status as ProjectStatus] : group.statuses;

  const [projects, people] = await Promise.all([
    listProjects(session.org.id, statusFilter.length ? { status: statusFilter } : {}),
    listPeople(session.org.id),
  ]);

  const isBoard = params.view === "board";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Projects"
        description={`${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        action={
          can(session.role, "project.create") ? (
            <ButtonLink href="/projects/new" variant="primary" size="sm">
              <Plus className="size-4" /> New request
            </ButtonLink>
          ) : null
        }
      />

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={g.key === "all" ? "/projects" : `/projects?group=${g.key}`}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              g.key === group.key && !params.status
                ? "bg-primary text-primary-foreground"
                : "bg-surface-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {g.label}
          </Link>
        ))}
        <span className="ml-auto hidden shrink-0 gap-1 rounded-full bg-surface-muted p-0.5 sm:flex">
          {(["list", "board"] as const).map((v) => (
            <Link
              key={v}
              href={`/projects?${new URLSearchParams({ ...(params.group ? { group: params.group } : {}), view: v })}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize",
                (v === "board") === isBoard ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {v}
            </Link>
          ))}
        </span>
      </div>

      {params.status ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Filtered to <StatusBadge status={params.status as ProjectStatus} />
          <Link href="/projects" className="font-medium text-primary">
            Clear
          </Link>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            title="No projects here"
            description="Nothing matches this filter yet."
            action={
              <ButtonLink href="/projects" size="sm">
                View all projects
              </ButtonLink>
            }
          />
        </Card>
      ) : isBoard ? (
        <PipelineBoard projects={projects} showFinancials={showFinancials} />
      ) : (
        <Card>
          <div className="divide-y divide-border-subtle">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} people={people} showFinancials={showFinancials} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Kanban across the happy path. Desktop only — on mobile the list is better. */
function PipelineBoard({
  projects,
  showFinancials,
}: {
  projects: Awaited<ReturnType<typeof listProjects>>;
  showFinancials: boolean;
}) {
  const columns = PIPELINE_ORDER.filter((s) => s !== "closed").map((status) => ({
    status,
    items: projects.filter((p) => p.status === status),
  }));

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-3 pb-2">
        {columns.map(({ status, items }) => (
          <div key={status} className="w-64 shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <StatusBadge status={status} />
              <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="block rounded-[var(--radius)] border border-border-subtle bg-surface p-3 transition-colors hover:border-border-strong"
                >
                  <p className="font-mono text-[11px] text-muted-foreground">{p.projectNumber}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-medium">{p.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{p.customerName}</p>
                  {showFinancials && p.contractValueCents > 0 ? (
                    <p className="mt-1.5 text-xs font-semibold tabular-nums">
                      {formatMoney(p.contractValueCents, "AUD", { compact: true })}
                    </p>
                  ) : null}
                </Link>
              ))}
              {items.length === 0 ? (
                <p className="rounded-[var(--radius)] border border-dashed border-border-subtle px-3 py-4 text-center text-xs text-muted-foreground">
                  Empty
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Showing {STATUS_META.new_request.label} through {STATUS_META.ready_for_invoice.label}. Closed, lost and
        cancelled jobs are in the Closed filter.
      </p>
    </div>
  );
}
