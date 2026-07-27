import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listAssignments, listLeave, listPeople, listProjects } from "@/lib/data/repository";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { addDays, cn, formatDate, formatWeekday, isSameDay, startOfWeek } from "@/lib/utils";

export const metadata = { title: "Schedule" };

const DAYS = 14;

export default async function SchedulePage() {
  const session = await getSession();
  const from = startOfWeek(new Date());
  const to = addDays(from, DAYS);

  const [assignments, leave, people, projects] = await Promise.all([
    listAssignments(session.org.id, { from, to }),
    listLeave(session.org.id),
    listPeople(session.org.id),
    listProjects(session.org.id, { status: ["waiting_for_scheduling"] }),
  ]);

  const installers = people.filter((p) => p.isSchedulable);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule"
        description={`${formatDate(from)} – ${formatDate(addDays(from, DAYS - 1))} · ${installers.length} installers`}
      />

      {projects.length > 0 ? (
        <Card>
          <CardHeader
            title="Waiting for scheduling"
            description="PO received — ready to allocate"
            action={<span className="text-xs text-muted-foreground tabular-nums">{projects.length}</span>}
          />
          <ul className="divide-y divide-border-subtle">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}/schedule`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{p.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.customerName} · requested {formatDate(p.scheduledStartAt ?? p.updatedAt)}
                    </p>
                  </div>
                  <Badge tone="blue">Allocate</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Resource timeline. Horizontal scroll on mobile beats cramming 14 columns. */}
      <Card className="overflow-hidden">
        <CardHeader title="Crew calendar" description="Bookings and approved leave" />
        <div className="overflow-x-auto">
          <div className="min-w-[52rem]">
            <div
              className="grid border-b border-border-subtle bg-surface-muted"
              style={{ gridTemplateColumns: `9rem repeat(${DAYS}, minmax(0, 1fr))` }}
            >
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Installer</div>
              {days.map((d) => {
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const today = isSameDay(d, new Date());
                return (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      "border-l border-border-subtle px-1 py-2 text-center text-[11px]",
                      weekend && "bg-surface",
                      today && "font-semibold text-primary",
                    )}
                  >
                    <div className="text-muted-foreground">{formatWeekday(d)}</div>
                    <div>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {installers.map((person) => (
              <div
                key={person.id}
                className="grid border-b border-border-subtle last:border-0"
                style={{ gridTemplateColumns: `9rem repeat(${DAYS}, minmax(0, 1fr))` }}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <Avatar initials={person.initials} className="size-6" />
                  <span className="truncate text-xs">{person.name}</span>
                </div>
                {days.map((day) => {
                  const booking = assignments.find(
                    (a) =>
                      a.userId === person.id &&
                      new Date(a.startsAt) <= addDays(day, 1) &&
                      new Date(a.endsAt) >= day &&
                      a.status !== "cancelled",
                  );
                  const onLeave = leave.find(
                    (l) =>
                      l.userId === person.id &&
                      l.status !== "declined" &&
                      new Date(l.startsAt) <= addDays(day, 1) &&
                      new Date(l.endsAt) >= day,
                  );
                  const weekend = day.getDay() === 0 || day.getDay() === 6;

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn("border-l border-border-subtle p-0.5", weekend && "bg-surface-muted/50")}
                      title={booking ? `${booking.projectNumber} — ${booking.projectTitle}` : onLeave?.type}
                    >
                      {onLeave ? (
                        <div
                          className={cn(
                            "h-7 rounded px-1 text-[10px] leading-7 truncate",
                            onLeave.status === "approved" ? "tone-rose" : "tone-amber",
                          )}
                        >
                          {onLeave.type.slice(0, 4)}
                        </div>
                      ) : booking ? (
                        <Link
                          href={`/projects/${booking.projectId}/schedule`}
                          className={cn(
                            "block h-7 truncate rounded px-1 text-[10px] leading-7",
                            booking.status === "confirmed" ? "tone-violet" : "tone-amber",
                          )}
                        >
                          {booking.projectNumber.split("-").at(-1)}
                        </Link>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}

            {installers.length === 0 ? <EmptyState title="No schedulable installers" /> : null}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded tone-violet" /> Confirmed booking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded tone-amber" /> Tentative / leave requested
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded tone-rose" /> Approved leave
        </span>
      </div>
    </div>
  );
}
