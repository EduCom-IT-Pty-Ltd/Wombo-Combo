import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getProject, listLeave, listPeople, listSchedulePhases } from "@/lib/data/repository";
import { SchedulePhaseManager } from "@/components/projects/schedule-phase-manager";

export default async function ProjectSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const project = await getProject(session.org.id, id);
  if (!project) notFound();
  const [phases, people, leave] = await Promise.all([listSchedulePhases(session.org.id, { projectId: id }), listPeople(session.org.id), listLeave(session.org.id)]);
  return <SchedulePhaseManager projectId={project.id} phases={phases} people={people} leave={leave} canManage={can(session.role, "schedule.manage", session.permissionOverrides)} />;
}
