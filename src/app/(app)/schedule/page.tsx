import { getSession } from "@/lib/auth/session";
import { listPeople, listSchedulePhases } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui";
import { PhaseCalendar } from "@/components/schedule/calendar";

export const metadata = { title: "Calendar" };

export default async function SchedulePage() {
  const session = await getSession();
  const [phases, people] = await Promise.all([listSchedulePhases(session.org.id), listPeople(session.org.id)]);
  return <div className="space-y-4"><PageHeader title="Calendar" description="Project phases by day, week, or month." /><PhaseCalendar phases={phases} people={people} /></div>;
}
