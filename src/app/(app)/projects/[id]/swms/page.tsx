import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getProject, getProjectSwms, getSwmsTemplate, listDocuments } from "@/lib/data/repository";
import { ProjectSwms } from "@/components/projects/project-swms";

export default async function ProjectSwmsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [project, template, record, documents] = await Promise.all([getProject(session.org.id, id), getSwmsTemplate(session.org.id), getProjectSwms(session.org.id, id), listDocuments(session.org.id, id)]);
  if (!project) notFound();
  // Pass every project photo through. The SWMS form decides which ones are
  // linked, so a user can safely attach an existing SharePoint project photo.
  const photos = documents.filter((document) => document.kind === "photo");
  return <ProjectSwms project={project} template={template} record={record} photos={photos} canEdit={can(session.role, "field.record", session.permissionOverrides)} />;
}
