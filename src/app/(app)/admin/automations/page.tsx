import { getStatusSettings } from "@/lib/data/repository";
import { AutomationRules } from "@/components/admin/automation-rules";
import { requireSettingsAccess } from "../guard";

export const metadata = { title: "Automations · Settings" };

export default async function AutomationsSettingsPage() {
  const session = await requireSettingsAccess();
  const statusSettings = await getStatusSettings(session.org.id);
  return <AutomationRules statusSettings={statusSettings} />;
}
