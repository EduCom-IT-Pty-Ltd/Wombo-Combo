import { getSession } from "@/lib/auth/session";
import { listPeople, listSchedulePhases, listTimeEntries } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui";
import { PhaseCalendar } from "@/components/schedule/calendar";

export const metadata = { title: "Calendar" };

export default async function SchedulePage() {
  const session = await getSession();
  const [phases, people, timeEntries] = await Promise.all([listSchedulePhases(session.org.id), listPeople(session.org.id), listTimeEntries(session.org.id)]);
  const onSiteAssignmentKeys = timeEntries.filter((entry) => !entry.endedAt).map((entry) => `${entry.projectId}:${entry.userId}`);
  return <div className="space-y-4"><PageHeader title="Calendar" description="Project Call-Ups by day, week, or month." /><PhaseCalendar phases={phases} people={people} onSiteAssignmentKeys={onSiteAssignmentKeys} /></div>;
}
