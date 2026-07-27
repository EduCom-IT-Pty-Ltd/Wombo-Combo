import { getSession } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/domain/permissions";
import { LEAVE_STATUSES, LEAVE_TYPES, ROLES } from "@/lib/db/schema/enums";
import { listLeave, listPeople } from "@/lib/data/repository";
import { PageHeader, Stat } from "@/components/ui";
import { PeopleManager } from "@/components/people/people-manager";

export const metadata = { title: "People" };

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function HrPage() {
  const session = await getSession();
  const [people, leave] = await Promise.all([listPeople(session.org.id), listLeave(session.org.id)]);
  const onLeave = leave.filter((item) => item.status === "approved" && new Date(item.startsAt) <= new Date() && new Date(item.endsAt) >= new Date()).length;
  return <div className="space-y-4"><PageHeader title="People" description="Team profiles, calendar colours, leave and unavailability." /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Team members" value={people.length} /><Stat label="Schedulable" value={people.filter((person) => person.isSchedulable).length} /><Stat label="Leave records" value={leave.length} /><Stat label="Unavailable today" value={onLeave} /></div><PeopleManager people={people} leave={leave} canManage={can(session.role, "hr.manage")} roles={ROLES.map((role) => ({ id: role, label: ROLE_LABELS[role] }))} leaveTypes={LEAVE_TYPES.map((type) => ({ id: type, label: label(type) }))} leaveStatuses={LEAVE_STATUSES.map((status) => ({ id: status, label: label(status) }))} /></div>;
}
