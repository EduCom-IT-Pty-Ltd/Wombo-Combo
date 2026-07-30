import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { entryHours } from "@/lib/domain/costing";
import { formatMoney } from "@/lib/domain/money";
import { getProject, listPeople, listQuotes, listTimeEntries } from "@/lib/data/repository";
import { Avatar, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { TimeAttendanceManager } from "@/components/projects/time-attendance-manager";

export default async function ProjectFieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const [entries, people, quotes] = await Promise.all([
    listTimeEntries(session.org.id, { projectId: id }),
    listPeople(session.org.id),
    listQuotes(session.org.id, id),
  ]);

  const showMaterialCosts = can(session.role, "finance.costs.view", session.permissionOverrides);
  const showLabourCosts = can(session.role, "finance.labour.view", session.permissionOverrides);
  const canManageAttendance = can(session.role, "schedule.manage", session.permissionOverrides);
  const totalHours = entries.reduce(
    (s, e) => s + entryHours(new Date(e.startedAt), e.endedAt ? new Date(e.endedAt) : null, e.breakMinutes),
    0,
  );
  const latestQuote = quotes[0] ?? null;
  const quotedMaterialCost = latestQuote?.subtotalCostCents ?? 0;
  const onSite = entries.filter((e) => !e.endedAt);
  const labourCost = entries.reduce((sum, entry) => sum + Math.round(entryHours(new Date(entry.startedAt), entry.endedAt ? new Date(entry.endedAt) : null, entry.breakMinutes) * entry.costRateCentsPerHour), 0);
  const labourByPerson = people.map((person) => {
    const personEntries = entries.filter((entry) => entry.userId === person.id);
    const hours = personEntries.reduce((sum, entry) => sum + entryHours(new Date(entry.startedAt), entry.endedAt ? new Date(entry.endedAt) : null, entry.breakMinutes), 0);
    return { person, hours, cost: Math.round(hours * person.costRateCentsPerHour) };
  }).filter((row) => row.hours > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hours logged" value={totalHours.toFixed(1)} hint={`${entries.length} entries`} />
        <Stat label="On site now" value={onSite.length} tone={onSite.length > 0 ? "good" : "default"} />
        <Stat label="Labour cost" value={showLabourCosts ? formatMoney(labourCost, session.org.currency, { compact: true }) : "—"} hint="Logged time × hourly rate" />
        <Stat
          label="Quoted materials"
          value={showMaterialCosts ? formatMoney(quotedMaterialCost, session.org.currency, { compact: true }) : latestQuote?.lines.length ?? 0}
          hint={latestQuote ? `${latestQuote.lines.length} current quote lines` : "No generated quote"}
        />
      </div>

      <Card>
        <CardHeader title="Labour by team member" description="Time logged against this project and its snapped hourly cost rate." />
        {labourByPerson.length ? <ul className="divide-y divide-border-subtle">{labourByPerson.map(({ person, hours, cost }) => <li key={person.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-2.5"><Avatar initials={person.initials} /><div><p className="text-sm font-bold">{person.name}</p><p className="text-xs text-muted-foreground">{hours.toFixed(1)} hours logged</p></div></div>{showLabourCosts ? <p className="text-sm font-bold tabular-nums">{formatMoney(cost, session.org.currency)}</p> : <p className="text-sm font-bold tabular-nums">{hours.toFixed(1)}h</p>}</li>)}</ul> : <EmptyState title="No labour logged" />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TimeAttendanceManager projectId={project.id} entries={entries} people={people} canManage={canManageAttendance} />

        <div className="space-y-4">
          <Card>
            <CardHeader title="Quoted materials" description="The latest generated quote for this project." />
            {latestQuote?.lines.length ? (
              <ul className="divide-y divide-border-subtle">
                {latestQuote.lines.map((line) => (
                  <li key={line.id ?? `${line.description}-${line.quantity}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{line.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {line.quantity} {line.unit}
                      </p>
                    </div>
                    {showMaterialCosts ? (
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatMoney(Math.round(line.quantity * line.unitCostCents), session.org.currency)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No generated quote" description="Create a material quote in the Quote tab to see its current materials here." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
