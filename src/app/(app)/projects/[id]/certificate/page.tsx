import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getOrganisationCertificateHeaderLocation, getProject, listDocuments } from "@/lib/data/repository";
import { ProjectCertificate } from "@/components/projects/project-certificate";

export default async function ProjectCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [project, documents, header] = await Promise.all([
    getProject(session.org.id, id),
    listDocuments(session.org.id, id),
    getOrganisationCertificateHeaderLocation(session.org.id),
  ]);
  if (!project) notFound();
  return <ProjectCertificate project={project} certificate={documents.find((document) => document.kind === "certificate") ?? null} hasHeader={Boolean(header)} canGenerate={can(session.role, "qa.certify", session.permissionOverrides)} canView={can(session.role, "document.view", session.permissionOverrides)} />;
}
