import { FieldJobPage } from "@/components/field/field-job-page";

export default async function FieldJobRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <FieldJobPage projectId={projectId} />;
}
