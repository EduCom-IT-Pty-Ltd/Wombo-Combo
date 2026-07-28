import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import {
  getProject,
  listEvents,
  listPeople,
} from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui";
import { formatDate, formatRelative } from "@/lib/utils";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const [events, people] = await Promise.all([
    listEvents(session.org.id, id),
    listPeople(session.org.id),
  ]);

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
            {can(session.role, "finance.revenue.view", session.permissionOverrides) ? (
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

      </div>

      <div className="space-y-4">
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
