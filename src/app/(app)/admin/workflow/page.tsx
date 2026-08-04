import { readStatusFieldTemplates, readStatusSettings, readStatusTaskTemplates } from "@/lib/data/local-store";
import { StatusFlowSettings } from "@/components/admin/status-flow-settings";

export const metadata = { title: "Project workflow · Settings" };

export default async function WorkflowSettingsPage() {
  const [settings, templates, fields] = await Promise.all([
    readStatusSettings(),
    readStatusTaskTemplates(),
    readStatusFieldTemplates(),
  ]);

  return <StatusFlowSettings settings={settings} templates={templates} fields={fields} />;
}
