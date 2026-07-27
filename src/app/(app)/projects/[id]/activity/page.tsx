import { Bot, User } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { listEvents, listPeople } from "@/lib/data/repository";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { formatDate, formatRelative, formatTime } from "@/lib/utils";

export default async function ProjectActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [events, people] = await Promise.all([listEvents(session.org.id, id), listPeople(session.org.id)]);

  return (
    <Card>
      <CardHeader title="Activity" description="Append-only audit trail of every change" />
      {events.length ? (
        <ol className="divide-y divide-border-subtle">
          {events.map((event) => {
            const actor = people.find((p) => p.id === event.actorId);
            const automated = !event.actorId;
            return (
              <li key={event.id} className="flex gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${automated ? "tone-blue" : "tone-slate"}`}
                >
                  {automated ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{event.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {actor?.name ?? "Automation"} · {formatDate(event.occurredAt)} {formatTime(event.occurredAt)} ·{" "}
                    {formatRelative(event.occurredAt)}
                  </p>
                </div>
                <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:block">
                  {event.type}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState title="No activity yet" />
      )}
    </Card>
  );
}
