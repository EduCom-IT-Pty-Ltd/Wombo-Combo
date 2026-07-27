import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { allowedTransitions } from "@/lib/domain/status";
import {
  buildTransitionContext,
  getProject,
  listEvents,
  listPeople,
  listTasks,
} from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui";
import { StatusControl } from "@/components/projects/status-control";
import { formatDate, formatRelative, isOverdue } from "@/lib/utils";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const [context, tasks, events, people] = await Promise.all([
    buildTransitionContext(session.org.id, project),
    listTasks(session.org.id, { projectId: id }),
    listEvents(session.org.id, id),
    listPeople(session.org.id),
  ]);

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const pm = people.find((p) => p.id === project.projectManagerId);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Scope of works" />
          <div className="px-4 py-3">
            <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
              {project.scopeOfWorks ?? "No scope captured yet."}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Details" />
          <dl className="px-4 py-1">
            <Field label="Customer">{project.customerName}</Field>
            <Field label="Site">
              {project.site ? (
                <>
                  {project.site.name}
                  <span className="block text-xs text-muted-foreground">
                    {project.site.address}, {project.site.suburb} {project.site.state} {project.site.postcode}
                  </span>
                </>
              ) : (
                "—"
              )}
            </Field>
            {project.site?.accessNotes ? (
              <Field label="Site access">
                <span className="text-muted-foreground">{project.site.accessNotes}</span>
              </Field>
            ) : null}
            <Field label="Project manager">{pm?.name ?? "Unassigned"}</Field>
            <Field label="Purchase order">
              {project.poNumber ? (
                <>
                  {project.poNumber}
                  <span className="ml-2 text-xs text-muted-foreground">
                    received {formatDate(project.poReceivedAt)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Not received</span>
              )}
            </Field>
            {can(session.role, "finance.view") ? (
              <Field label="Deposit">
                {project.depositRequiredCents ? (
                  <>
                    {formatMoney(project.depositRequiredCents, session.org.currency)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {project.depositReceivedAt ? `received ${formatDate(project.depositReceivedAt)}` : "outstanding"}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not required</span>
                )}
              </Field>
            ) : null}
            <Field label="Requested start">{formatDate(project.requestedStartOn, true)}</Field>
            <Field label="Scheduled">
              {project.scheduledStartAt
                ? `${formatDate(project.scheduledStartAt, true)} – ${formatDate(project.scheduledEndAt, true)}`
                : "Not scheduled"}
            </Field>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Open tasks" description={`${openTasks.length} outstanding`} />
          {openTasks.length ? (
            <ul className="divide-y divide-border-subtle">
              {openTasks.map((task) => {
                const assignee = people.find((p) => p.id === task.assigneeId);
                return (
                  <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignee?.name ?? "Unassigned"}
                        {task.createdByAutomation ? " · auto-created" : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs ${isOverdue(task.dueOn) ? "font-medium text-[var(--tone-rose-fg)]" : "text-muted-foreground"}`}
                    >
                      {formatRelative(task.dueOn)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No open tasks" />
          )}
        </Card>
      </div>

      <div className="space-y-4">
        {can(session.role, "project.transition") ? (
          <StatusControl
            projectId={project.id}
            status={project.status}
            heldFromStatus={project.heldFromStatus}
            allowed={allowedTransitions(project.status, project.heldFromStatus)}
            context={context}
            canOverride={can(session.role, "project.transition.override")}
          />
        ) : null}

        <Card>
          <CardHeader title="Recent activity" />
          {events.length ? (
            <ul className="space-y-3 px-4 py-3">
              {events.slice(0, 6).map((event) => {
                const actor = people.find((p) => p.id === event.actorId);
                return (
                  <li key={event.id} className="text-sm">
                    <p className="text-foreground">{event.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {actor?.name ?? "Automation"} · {formatRelative(event.occurredAt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </Card>
      </div>
    </div>
  );
}
