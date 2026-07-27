import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { detectConflicts } from "@/lib/domain/scheduling";
import { getProject, listAssignments, listLeave, listPeople } from "@/lib/data/repository";
import { Avatar, Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";

const ASSIGNMENT_TONES = {
  tentative: "amber",
  confirmed: "emerald",
  declined: "rose",
  completed: "slate",
  cancelled: "slate",
} as const;

export default async function ProjectSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const [assignments, allAssignments, leave, people] = await Promise.all([
    listAssignments(session.org.id, { projectId: id }),
    listAssignments(session.org.id),
    listLeave(session.org.id),
    listPeople(session.org.id),
  ]);

  // Re-run conflict detection on display: leave approved after the booking was
  // made would otherwise sit silently against the assignment.
  const withConflicts = assignments.map((a) => ({
    assignment: a,
    person: people.find((p) => p.id === a.userId),
    conflicts: detectConflicts(
      { userId: a.userId, startsAt: new Date(a.startsAt), endsAt: new Date(a.endsAt), excludeAssignmentId: a.id },
      allAssignments.map((x) => ({ ...x, startsAt: new Date(x.startsAt), endsAt: new Date(x.endsAt) })),
      leave.map((l) => ({ ...l, startsAt: new Date(l.startsAt), endsAt: new Date(l.endsAt) })),
    ),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Crew allocation"
          description={
            project.scheduledStartAt
              ? `${formatDate(project.scheduledStartAt, true)} – ${formatDate(project.scheduledEndAt, true)}`
              : "Not yet scheduled"
          }
        />
        {withConflicts.length ? (
          <ul className="divide-y divide-border-subtle">
            {withConflicts.map(({ assignment, person, conflicts }) => (
              <li key={assignment.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar initials={person?.initials ?? "?"} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{person?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{assignment.role}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={ASSIGNMENT_TONES[assignment.status]}>{assignment.status}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(assignment.startsAt)} – {formatDate(assignment.endsAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(assignment.startsAt)}–{formatTime(assignment.endsAt)}
                    </p>
                  </div>
                </div>

                {conflicts.map((c, i) => (
                  <p
                    key={i}
                    className={`mt-2 flex items-start gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 text-xs ${
                      c.severity === "block" ? "tone-rose" : "tone-amber"
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {c.message}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No crew allocated"
            description="Allocate installers to move this job to Scheduled. Conflicts with leave and other bookings are checked automatically."
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Availability" description="Installers and current leave" />
        <ul className="divide-y divide-border-subtle">
          {people
            .filter((p) => p.isSchedulable)
            .map((p) => {
              const onLeave = leave.filter((l) => l.userId === p.id && l.status !== "declined");
              const booked = allAssignments.filter((a) => a.userId === p.id && a.status !== "cancelled");
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar initials={p.initials} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {booked.length} booking{booked.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  {onLeave.length ? (
                    <Badge tone={onLeave[0].status === "approved" ? "rose" : "amber"}>
                      {onLeave[0].type} {formatDate(onLeave[0].startsAt)}
                    </Badge>
                  ) : (
                    <Badge tone="emerald">Available</Badge>
                  )}
                </li>
              );
            })}
        </ul>
      </Card>
    </div>
  );
}
