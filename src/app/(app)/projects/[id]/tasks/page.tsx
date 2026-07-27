import { getSession } from "@/lib/auth/session";
import { listPeople, listTasks } from "@/lib/data/repository";
import { Avatar, Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatRelative, isOverdue } from "@/lib/utils";
import type { TaskStatus } from "@/lib/db/schema/enums";

const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

const KIND_TONES = {
  general: "slate",
  install: "violet",
  qa: "emerald",
  procurement: "blue",
  admin: "slate",
  defect: "rose",
} as const;

export default async function ProjectTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [tasks, people] = await Promise.all([
    listTasks(session.org.id, { projectId: id }),
    listPeople(session.org.id),
  ]);

  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState title="No tasks yet" description="Tasks appear here as work is planned or raised automatically." />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map(({ status, label }) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <Card key={status}>
            <CardHeader
              title={label}
              action={<span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>}
            />
            {items.length ? (
              <ul className="divide-y divide-border-subtle">
                {items.map((task) => {
                  const assignee = people.find((p) => p.id === task.assigneeId);
                  return (
                    <li key={task.id} className="px-4 py-3">
                      <p className="text-sm">{task.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone={KIND_TONES[task.kind]}>{task.kind}</Badge>
                        {task.createdByAutomation ? <Badge tone="slate">auto</Badge> : null}
                        {task.dueOn ? (
                          <span
                            className={`text-xs ${isOverdue(task.dueOn) && task.status !== "done" ? "font-medium text-[var(--tone-rose-fg)]" : "text-muted-foreground"}`}
                          >
                            {formatRelative(task.dueOn)}
                          </span>
                        ) : null}
                        {assignee ? <Avatar initials={assignee.initials} className="ml-auto size-6" /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
