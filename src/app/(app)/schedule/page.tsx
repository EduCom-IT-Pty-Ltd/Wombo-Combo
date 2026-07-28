import { fieldUserId, getSession } from "@/lib/auth/session";
import { getOpenTimeEntry, listPeople, listSchedulePhases } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui";
import { PhaseCalendar } from "@/components/schedule/calendar";

export const metadata = { title: "Calendar" };

export default async function SchedulePage() {
  const session = await getSession();
  const [phases, people, openEntry] = await Promise.all([listSchedulePhases(session.org.id), listPeople(session.org.id), getOpenTimeEntry(session.org.id, fieldUserId(session))]);
  return <div className="space-y-4"><PageHeader title="Calendar" description="Project Call-Ups by day, week, or month." /><PhaseCalendar phases={phases} people={people} onSiteProjectId={openEntry?.projectId} /></div>;
}
