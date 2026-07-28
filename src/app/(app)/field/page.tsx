import Link from "next/link";
import { CalendarDays, MapPin, ShieldAlert } from "lucide-react";
import { fieldUserId, getSession } from "@/lib/auth/session";
import { entryHours } from "@/lib/domain/costing";
import {
  getOpenTimeEntry,
  listAssignments,
  listDocuments,
  listPeople,
  listProjects,
  listTasks,
  listTimeEntries,
} from "@/lib/data/repository";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { ClockButton } from "@/components/field/clock-button";
import { LogActions } from "@/components/field/log-actions";
import { formatDate, formatTime } from "@/lib/utils";

export const metadata = { title: "My Day" };

/**
 * The crew's home screen. One job, one clock, four log buttons — everything a
 * person standing on site with a phone in one hand needs, and nothing else.
 * Office detail (margins, pipeline, quotes) deliberately never appears here.
 */
export default async function FieldPage() {
  const session = await getSession();
  const userId = fieldUserId(session);

  const [assignments, people, openEntry, tasks, myEntries] = await Promise.all([
    listAssignments(session.org.id, { userId }),
    listPeople(session.org.id),
    getOpenTimeEntry(session.org.id, userId),
    listTasks(session.org.id, { assigneeId: userId }),
    listTimeEntries(session.org.id, { userId }),
  ]);

  const me = people.find((person) => person.id === userId);
  const now = new Date();

  const current = assignments.find((a) => new Date(a.startsAt) <= now && new Date(a.endsAt) >= now);
  const upcoming = assignments.filter((a) => new Date(a.startsAt) > now).slice(0, 4);

  // The job you are clocked onto wins over the booking, so a crew pulled onto a
  // different site still sees the right buttons.
  const activeProjectId = openEntry?.projectId ?? current?.projectId;
  const [project, documents] = activeProjectId
    ? await Promise.all([
        listProjects(session.org.id).then((all) => all.find((p) => p.id === activeProjectId)),
        listDocuments(session.org.id, activeProjectId),
      ])
    : [undefined, []];

  const mustAcknowledge = documents.filter((d) => d.requiresAcknowledgement);
  const myTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const hoursToday = myEntries
    .filter((entry) => entry.startedAt >= startOfDay)
    .reduce((sum, e) => sum + entryHours(new Date(e.startedAt), e.endedAt ? new Date(e.endedAt) : null, e.breakMinutes), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}, {me?.name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(now, true)}
          {hoursToday > 0 ? ` · ${hoursToday.toFixed(1)}h logged today` : ""}
        </p>
      </div>

      {project ? (
        <Card className="overflow-hidden">
          <div className="border-b border-border-subtle bg-surface-muted px-4 py-3">
            <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {openEntry ? "On site now" : "Today's job"}
            </p>
            <h2 className="mt-1 text-lg font-bold leading-snug">{project.title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{project.customerName}</p>
          </div>

          <div className="space-y-4 px-4 py-4">
            {project.siteLabel ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.siteLabel)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2.5 rounded-[var(--radius)] border border-border-subtle px-3 py-2.5 text-sm active:bg-surface-muted"
              >
                <MapPin className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">{project.siteLabel}</span>
                <span className="shrink-0 text-xs font-bold text-primary">Directions</span>
              </a>
            ) : null}

            {current ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4 shrink-0" />
                Booked {formatTime(current.startsAt)} – {formatTime(current.endsAt)} · {current.role}
              </p>
            ) : null}

            {mustAcknowledge.length > 0 ? (
              <Link
                href={`/projects/${project.id}/documents`}
                className="block rounded-[var(--radius)] tone-amber px-3 py-3"
              >
                <p className="flex items-center gap-2 text-sm font-bold">
                  <ShieldAlert className="size-4 shrink-0" />
                  {mustAcknowledge.length} document{mustAcknowledge.length === 1 ? "" : "s"} to sign on
                </p>
                <ul className="mt-1 space-y-0.5">
                  {mustAcknowledge.map((d) => (
                    <li key={d.id} className="truncate text-xs">
                      · {d.name}
                    </li>
                  ))}
                </ul>
              </Link>
            ) : null}

            <ClockButton
              projectId={project.id}
              openEntry={openEntry ? { id: openEntry.id, startedAt: openEntry.startedAt } : null}
            />

            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">Log something</p>
              <LogActions projectId={project.id} />
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Nothing on site today"
            description="You have no active booking right now. Anything coming up is listed below."
          />
        </Card>
      )}

      {myTasks.length > 0 ? (
        <Card>
          <CardHeader title="My jobs to do" description={`${myTasks.length} outstanding`} />
          <ul className="divide-y divide-border-subtle">
            {myTasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/projects/${task.projectId}/tasks`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 active:bg-surface-muted"
                >
                  <span className="min-w-0 text-sm font-medium">{task.title}</span>
                  {task.status === "blocked" ? (
                    <span className="shrink-0 rounded-full tone-rose px-2 py-0.5 text-xs font-bold">Blocked</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Coming up" />
        {upcoming.length ? (
          <ul className="divide-y divide-border-subtle">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/projects/${a.projectId}`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 active:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.projectTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.siteLabel}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">{formatDate(a.startsAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing booked" />
        )}
      </Card>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}
