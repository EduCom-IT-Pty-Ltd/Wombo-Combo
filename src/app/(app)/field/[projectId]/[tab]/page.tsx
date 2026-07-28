import { FieldJobPage } from "@/components/field/field-job-page";

export default async function FieldJobTabRoute({ params }: { params: Promise<{ projectId: string; tab: string }> }) {
  const { projectId, tab } = await params;
  return <FieldJobPage projectId={projectId} activeSegment={tab} />;
}
