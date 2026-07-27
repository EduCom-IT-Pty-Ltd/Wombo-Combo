import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listDefects, listPeople, listProjects } from "@/lib/data/repository";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { formatRelative, isOverdue } from "@/lib/utils";

export const metadata = { title: "QA & Compliance" };

const SEVERITY_TONES = { minor: "slate", major: "amber", critical: "rose" } as const;

export default async function QaPage() {
  const session = await getSession();
  const [projects, defects, people] = await Promise.all([
    listProjects(session.org.id),
    listDefects(session.org.id),
    listPeople(session.org.id),
  ]);

  const awaitingQa = projects.filter((p) => ["installation_complete", "qa"].includes(p.status));
  const openDefects = defects.filter((d) => !d.resolvedAt);

  return (
    <div className="space-y-4">
      <PageHeader title="QA & Compliance" description="Inspections, defects and completion certificates" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting inspection" value={awaitingQa.length} tone={awaitingQa.length > 0 ? "warn" : "good"} />
        <Stat label="Open defects" value={openDefects.length} />
        <Stat label="Critical" value={openDefects.filter((d) => d.severity === "critical").length} tone="warn" />
        <Stat
          label="Overdue"
          value={openDefects.filter((d) => isOverdue(d.dueOn)).length}
          tone={openDefects.some((d) => isOverdue(d.dueOn)) ? "warn" : "good"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Inspection queue" description="Raised automatically on installation complete" />
          {awaitingQa.length ? (
            <ul className="divide-y divide-border-subtle">
              {awaitingQa.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}/qa`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.customerName}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Queue is clear" />
          )}
        </Card>

        <Card>
          <CardHeader title="Open defects" />
          {openDefects.length ? (
            <ul className="divide-y divide-border-subtle">
              {openDefects.map((d) => {
                const project = projects.find((p) => p.id === d.projectId);
                const assignee = people.find((p) => p.id === d.assigneeId);
                return (
                  <li key={d.id}>
                    <Link
                      href={`/projects/${d.projectId}/qa`}
                      className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{d.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project?.projectNumber} · {assignee?.name ?? "Unassigned"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge tone={SEVERITY_TONES[d.severity]}>{d.severity}</Badge>
                        <p
                          className={`mt-1 text-xs ${isOverdue(d.dueOn) ? "font-medium text-[var(--tone-rose-fg)]" : "text-muted-foreground"}`}
                        >
                          {formatRelative(d.dueOn)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No open defects" />
          )}
        </Card>
      </div>
    </div>
  );
}
