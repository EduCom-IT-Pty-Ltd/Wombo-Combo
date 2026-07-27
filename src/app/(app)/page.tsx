import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { PIPELINE_ORDER, STATUS_META } from "@/lib/domain/status";
import {
  getDashboardMetrics,
  listAssignments,
  listPeople,
  listProjects,
  listTasks,
} from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { ProjectRow } from "@/components/projects/project-row";
import { formatDate, formatRelative, isOverdue } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await getSession();
  const orgId = session.org.id;
  const showFinancials = can(session.role, "finance.view");

  const now = new Date();
  const [metrics, projects, people, tasks, assignments] = await Promise.all([
    getDashboardMetrics(orgId),
    listProjects(orgId),
    listPeople(orgId),
    listTasks(orgId),
    listAssignments(orgId, { from: now, to: new Date(now.getTime() + 14 * 86_400_000) }),
  ]);

  const myTasks = tasks
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""))
    .slice(0, 6);

  const needsAttention = projects
    .filter((p) => ["waiting_for_scheduling", "approved", "awaiting_approval", "qa"].includes(p.status))
    .slice(0, 5);

  // Counts per pipeline stage, for the funnel strip.
  const byStatus = PIPELINE_ORDER.map((status) => ({
    status,
    count: projects.filter((p) => p.status === status).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Good {greeting()}, {session.user.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {metrics.activeProjects} active projects · {metrics.onSiteNow} crew on site right now
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Work in progress"
          value={showFinancials ? formatMoney(metrics.wipValueCents, session.org.currency, { compact: true }) : "—"}
          hint="Scheduled through QA"
        />
        <Stat
          label="Quotes outstanding"
          value={
            showFinancials
              ? formatMoney(metrics.quotesOutstandingCents, session.org.currency, { compact: true })
              : String(metrics.quotesOutstandingCount)
          }
          hint={`${metrics.quotesOutstandingCount} awaiting decision`}
        />
        <Stat
          label="Awaiting scheduling"
          value={metrics.awaitingScheduling}
          hint="PO received, not booked"
          tone={metrics.awaitingScheduling > 0 ? "warn" : "default"}
        />
        <Stat
          label="Overdue tasks"
          value={metrics.overdueTasks}
          hint={`${metrics.openDefects} open defects`}
          tone={metrics.overdueTasks > 0 ? "warn" : "good"}
        />
      </div>

      <Card>
        <CardHeader title="Pipeline" description="Live count by stage" />
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {byStatus.map(({ status, count }) => (
            <Link
              key={status}
              href={`/projects?status=${status}`}
              className={`shrink-0 rounded-[var(--radius)] px-3 py-2 tone-${STATUS_META[status].tone} transition-opacity hover:opacity-80`}
            >
              <p className="text-lg font-semibold tabular-nums">{count}</p>
              <p className="text-[11px] font-medium whitespace-nowrap">{STATUS_META[status].label}</p>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs attention"
            description="Jobs waiting on you"
            action={
              <Link href="/projects" className="flex items-center gap-1 text-xs font-medium text-primary">
                All projects <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {needsAttention.length ? (
            <div className="divide-y divide-border-subtle">
              {needsAttention.map((p) => (
                <ProjectRow key={p.id} project={p} people={people} showFinancials={showFinancials} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing waiting" description="Every job is moving." />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Open tasks" description="Across all projects" />
            {myTasks.length ? (
              <ul className="divide-y divide-border-subtle">
                {myTasks.map((task) => {
                  const project = projects.find((p) => p.id === task.projectId);
                  const overdue = isOverdue(task.dueOn);
                  return (
                    <li key={task.id}>
                      <Link
                        href={`/projects/${task.projectId}/tasks`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-muted"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">{task.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {project?.projectNumber}
                            {task.createdByAutomation ? " · auto-created" : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-xs tabular-nums ${overdue ? "font-medium text-[var(--tone-rose-fg)]" : "text-muted-foreground"}`}
                        >
                          {formatRelative(task.dueOn)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No open tasks" />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Next 14 days on site"
              action={
                <Link href="/schedule" className="flex items-center gap-1 text-xs font-medium text-primary">
                  Schedule <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            {assignments.length ? (
              <ul className="divide-y divide-border-subtle">
                {assignments.slice(0, 5).map((a) => {
                  const installer = people.find((p) => p.id === a.userId);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{a.projectTitle}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {installer?.name} · {a.role}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.startsAt)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Nothing booked" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
