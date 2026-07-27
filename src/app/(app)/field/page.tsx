import Link from "next/link";
import { Camera, FileText, MapPin, Package, ShieldAlert, TriangleAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import {
  getOpenTimeEntry,
  listAssignments,
  listDocuments,
  listPeople,
  listProjects,
  listTasks,
} from "@/lib/data/repository";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ClockButton } from "@/components/field/clock-button";
import { formatDate, formatTime } from "@/lib/utils";

export const metadata = { title: "My Day" };

/**
 * The field app. Optimised for one-handed phone use on site: today's job first,
 * one big clock button, then the things a crew actually opens — SWMS, drawings,
 * and the buttons to record materials, photos and variations.
 *
 * In demo mode the session user is an office account, so we borrow an installer
 * identity to have something to show. With WorkOS this is just `session.user.id`.
 */
const DEMO_FIELD_USER_ID = "u-ash";

export default async function FieldPage() {
  const session = await getSession();
  const fieldUserId = session.isDemo ? DEMO_FIELD_USER_ID : session.user.id;

  const [assignments, people, openEntry, tasks] = await Promise.all([
    listAssignments(session.org.id, { userId: fieldUserId }),
    listPeople(session.org.id),
    getOpenTimeEntry(session.org.id, fieldUserId),
    listTasks(session.org.id, { assigneeId: fieldUserId }),
  ]);

  const me = people.find((p) => p.id === fieldUserId);
  const now = new Date();

  const today = assignments.filter(
    (a) => new Date(a.startsAt) <= now && new Date(a.endsAt) >= now,
  );
  const upcoming = assignments.filter((a) => new Date(a.startsAt) > now).slice(0, 4);

  const current = today[0];
  const [project, documents] = current
    ? await Promise.all([
        listProjects(session.org.id).then((ps) => ps.find((p) => p.id === current.projectId)),
        listDocuments(session.org.id, current.projectId),
      ])
    : [undefined, []];

  const mustAcknowledge = documents.filter((d) => d.requiresAcknowledgement);
  const myTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Day"
        description={`${me?.name ?? "You"} · ${formatDate(now, true)}`}
      />

      {current && project ? (
        <Card>
          <CardHeader
            title={project.title}
            description={project.customerName}
            action={<Badge tone="violet">{current.role}</Badge>}
          />
          <div className="space-y-3 px-4 py-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>{project.siteLabel}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Booked {formatTime(current.startsAt)} – {formatTime(current.endsAt)}
            </p>

            {mustAcknowledge.length > 0 ? (
              <div className="rounded-[var(--radius)] tone-amber px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <ShieldAlert className="size-3.5" />
                  {mustAcknowledge.length} document{mustAcknowledge.length === 1 ? "" : "s"} to sign on
                </p>
                <ul className="mt-1 space-y-0.5">
                  {mustAcknowledge.map((d) => (
                    <li key={d.id} className="truncate text-xs">
                      · {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <ClockButton
              projectId={current.projectId}
              openEntry={openEntry ? { id: openEntry.id, startedAt: openEntry.startedAt } : null}
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <QuickAction href={`/projects/${current.projectId}/field`} icon={<Package className="size-5" />} label="Materials" />
              <QuickAction href={`/projects/${current.projectId}/field`} icon={<Camera className="size-5" />} label="Photos" />
              <QuickAction href={`/projects/${current.projectId}/field`} icon={<TriangleAlert className="size-5" />} label="Variation" />
              <QuickAction href={`/projects/${current.projectId}/documents`} icon={<FileText className="size-5" />} label="Docs" />
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Nothing on site today"
            description="You have no active booking right now. Upcoming jobs are listed below."
          />
        </Card>
      )}

      {myTasks.length > 0 ? (
        <Card>
          <CardHeader title="My tasks" />
          <ul className="divide-y divide-border-subtle">
            {myTasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/projects/${task.projectId}/tasks`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                >
                  <span className="min-w-0 truncate text-sm">{task.title}</span>
                  <Badge tone={task.status === "blocked" ? "rose" : "slate"}>{task.status.replace("_", " ")}</Badge>
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
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{a.projectTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.siteLabel}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.startsAt)}</span>
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

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border-subtle text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
