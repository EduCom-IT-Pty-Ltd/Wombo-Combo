import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { entryHours } from "@/lib/domain/costing";
import { formatMoney } from "@/lib/domain/money";
import { getProject, listMaterials, listPeople, listQuotes, listTimeEntries, listVariations } from "@/lib/data/repository";
import { Avatar, Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";

const VARIATION_TONES = {
  draft: "slate",
  submitted: "amber",
  approved: "emerald",
  rejected: "rose",
  invoiced: "blue",
} as const;

export default async function ProjectFieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();

  const [entries, materials, variations, people, quotes] = await Promise.all([
    listTimeEntries(session.org.id, { projectId: id }),
    listMaterials(session.org.id, id),
    listVariations(session.org.id, id),
    listPeople(session.org.id),
    listQuotes(session.org.id, id),
  ]);

  const showCosts = can(session.role, "finance.view");
  const totalHours = entries.reduce(
    (s, e) => s + entryHours(new Date(e.startedAt), e.endedAt ? new Date(e.endedAt) : null, e.breakMinutes),
    0,
  );
  const materialCost = materials.reduce((s, m) => s + m.quantity * m.unitCostCents, 0);
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Hours logged" value={totalHours.toFixed(1)} hint={`${entries.length} entries`} />
        <Stat label="On site now" value={onSite.length} tone={onSite.length > 0 ? "good" : "default"} />
        <Stat label="Labour cost" value={showCosts ? formatMoney(labourCost, session.org.currency, { compact: true }) : "—"} hint="Logged time × hourly rate" />
        <Stat
          label="Materials"
          value={showCosts ? formatMoney(quotedMaterialCost || materialCost, session.org.currency, { compact: true }) : latestQuote?.lines.length ?? materials.length}
          hint={latestQuote ? `${latestQuote.lines.length} quoted lines · ${materials.length} used` : showCosts ? `${materials.length} lines used` : "lines recorded"}
        />
        <Stat
          label="Variations"
          value={variations.length}
          hint={`${variations.filter((v) => v.status === "approved").length} approved`}
        />
      </div>

      <Card>
        <CardHeader title="Labour by team member" description="Time logged against this project and its snapped hourly cost rate." />
        {labourByPerson.length ? <ul className="divide-y divide-border-subtle">{labourByPerson.map(({ person, hours, cost }) => <li key={person.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-2.5"><Avatar initials={person.initials} /><div><p className="text-sm font-bold">{person.name}</p><p className="text-xs text-muted-foreground">{hours.toFixed(1)} hours logged</p></div></div>{showCosts ? <p className="text-sm font-bold tabular-nums">{formatMoney(cost, session.org.currency)}</p> : <p className="text-sm font-bold tabular-nums">{hours.toFixed(1)}h</p>}</li>)}</ul> : <EmptyState title="No labour logged" />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Time & attendance" description="Clock on / clock off from the field app" />
          {entries.length ? (
            <ul className="divide-y divide-border-subtle">
              {entries
                .slice()
                .reverse()
                .map((entry) => {
                  const person = people.find((p) => p.id === entry.userId);
                  const hours = entryHours(
                    new Date(entry.startedAt),
                    entry.endedAt ? new Date(entry.endedAt) : null,
                    entry.breakMinutes,
                  );
                  return (
                    <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar initials={person?.initials ?? "?"} />
                        <div className="min-w-0">
                          <p className="truncate text-sm">{person?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(entry.startedAt)} · {formatTime(entry.startedAt)}–
                            {entry.endedAt ? formatTime(entry.endedAt) : "now"}
                            {entry.breakMinutes ? ` · ${entry.breakMinutes}m break` : ""}
                          </p>
                        </div>
                      </div>
                      {entry.endedAt ? (
                        <span className="shrink-0 text-sm tabular-nums">{hours.toFixed(1)}h</span>
                      ) : (
                        <Badge tone="emerald">On site</Badge>
                      )}
                    </li>
                  );
                })}
            </ul>
          ) : (
            <EmptyState title="No time logged" />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Materials used" />
            {materials.length ? (
              <ul className="divide-y divide-border-subtle">
                {materials.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{m.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.quantity} {m.unit} · {formatDate(m.recordedAt)}
                      </p>
                    </div>
                    {showCosts ? (
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatMoney(Math.round(m.quantity * m.unitCostCents), session.org.currency)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No materials recorded" />
            )}
          </Card>

          <Card>
            <CardHeader title="Variations" description="Scope changes raised on site" />
            {variations.length ? (
              <ul className="divide-y divide-border-subtle">
                {variations.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{v.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">{v.reference}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={VARIATION_TONES[v.status as keyof typeof VARIATION_TONES]}>{v.status}</Badge>
                      {showCosts ? (
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {formatMoney(v.quotedSellCents, session.org.currency)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No variations" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
