import { Check, Minus, X } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { listDefects, listInspections, listPeople } from "@/lib/data/repository";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatDate, formatRelative } from "@/lib/utils";

const RESULT_TONES = { pending: "amber", pass: "emerald", pass_with_defects: "amber", fail: "rose" } as const;
const SEVERITY_TONES = { minor: "slate", major: "amber", critical: "rose" } as const;

export default async function ProjectQaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [inspections, defects, people] = await Promise.all([
    listInspections(session.org.id, id),
    listDefects(session.org.id, { projectId: id }),
    listPeople(session.org.id),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {inspections.length === 0 ? (
          <Card>
            <EmptyState
              title="No inspection yet"
              description="A QA inspection is raised automatically when installation is marked complete."
            />
          </Card>
        ) : (
          inspections.map((inspection) => {
            const inspector = people.find((p) => p.id === inspection.inspectorId);
            const answered = inspection.items.filter((i) => i.passed !== null).length;
            return (
              <Card key={inspection.id}>
                <CardHeader
                  title="QA inspection"
                  description={`${inspector?.name ?? "Unassigned"} · ${
                    inspection.completedAt
                      ? `completed ${formatDate(inspection.completedAt, true)}`
                      : `scheduled ${formatDate(inspection.scheduledFor, true)}`
                  } · ${answered}/${inspection.items.length} checked`}
                  action={<Badge tone={RESULT_TONES[inspection.result]}>{inspection.result.replaceAll("_", " ")}</Badge>}
                />
                <ul className="divide-y divide-border-subtle">
                  {inspection.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                          item.passed === true
                            ? "tone-emerald"
                            : item.passed === false
                              ? "tone-rose"
                              : "tone-slate"
                        }`}
                      >
                        {item.passed === true ? (
                          <Check className="size-3" />
                        ) : item.passed === false ? (
                          <X className="size-3" />
                        ) : (
                          <Minus className="size-3" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm">
                          {item.prompt}
                          {item.isCritical ? (
                            <span className="ml-2 text-xs font-medium text-[var(--tone-rose-fg)]">critical</span>
                          ) : null}
                        </p>
                        {item.comment ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.comment}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader title="Defects" description={`${defects.filter((d) => !d.resolvedAt).length} open`} />
        {defects.length ? (
          <ul className="divide-y divide-border-subtle">
            {defects.map((d) => {
              const assignee = people.find((p) => p.id === d.assigneeId);
              return (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm">{d.title}</p>
                    <Badge tone={SEVERITY_TONES[d.severity]}>{d.severity}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {assignee?.name ?? "Unassigned"} ·{" "}
                    {d.resolvedAt ? `resolved ${formatRelative(d.resolvedAt)}` : `due ${formatRelative(d.dueOn)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No defects raised" />
        )}
      </Card>
    </div>
  );
}
