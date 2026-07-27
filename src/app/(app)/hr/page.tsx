import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { listAssignments, listLeave, listPeople } from "@/lib/data/repository";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "People" };

const LEAVE_TONES = { requested: "amber", approved: "emerald", declined: "rose", cancelled: "slate" } as const;

export default async function HrPage() {
  const session = await getSession();
  const [people, leave, assignments] = await Promise.all([
    listPeople(session.org.id),
    listLeave(session.org.id),
    listAssignments(session.org.id),
  ]);

  const showRates = can(session.role, "hr.manage");
  const pending = leave.filter((l) => l.status === "requested");
  const installers = people.filter((p) => p.isSchedulable);

  return (
    <div className="space-y-4">
      <PageHeader title="People" description="Team, leave and availability" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Team members" value={people.length} />
        <Stat label="Schedulable installers" value={installers.length} />
        <Stat label="Leave requests" value={pending.length} tone={pending.length > 0 ? "warn" : "default"} />
        <Stat
          label="On leave now"
          value={
            leave.filter(
              (l) => l.status === "approved" && new Date(l.startsAt) <= new Date() && new Date(l.endsAt) >= new Date(),
            ).length
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Team" />
          <ul className="divide-y divide-border-subtle">
            {people.map((p) => {
              const bookings = assignments.filter((a) => a.userId === p.id && a.status !== "cancelled").length;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar initials={p.initials} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ROLE_LABELS[p.role]}
                        {p.isSchedulable ? ` · ${bookings} bookings` : ""}
                      </p>
                    </div>
                  </div>
                  {showRates && p.costRateCentsPerHour > 0 ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatMoney(p.costRateCentsPerHour, session.org.currency)}/hr
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Leave & unavailability"
            description="Blocks allocation on the scheduling board"
          />
          {leave.length ? (
            <ul className="divide-y divide-border-subtle">
              {leave.map((l) => {
                const person = people.find((p) => p.id === l.userId);
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar initials={person?.initials ?? "?"} />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{person?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.type.replace("_", " ")} · {formatDate(l.startsAt)} – {formatDate(l.endsAt)}
                        </p>
                      </div>
                    </div>
                    <Badge tone={LEAVE_TONES[l.status as keyof typeof LEAVE_TONES]}>{l.status}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No leave recorded" />
          )}
        </Card>
      </div>
    </div>
  );
}
