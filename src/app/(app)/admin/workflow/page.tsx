import { getStatusFieldTemplates, getStatusSettings, getStatusTaskTemplates } from "@/lib/data/repository";
import { StatusFlowSettings } from "@/components/admin/status-flow-settings";
import { requireSettingsAccess } from "../guard";

export const metadata = { title: "Project workflow · Settings" };

export default async function WorkflowSettingsPage() {
  const session = await requireSettingsAccess();
  const [settings, templates, fields] = await Promise.all([
    getStatusSettings(session.org.id),
    getStatusTaskTemplates(session.org.id),
    getStatusFieldTemplates(session.org.id),
  ]);

  return <StatusFlowSettings settings={settings} templates={templates} fields={fields} />;
}
