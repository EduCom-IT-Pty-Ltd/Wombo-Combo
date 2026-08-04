import { readStatusSettings } from "@/lib/data/local-store";
import { AutomationRules } from "@/components/admin/automation-rules";

export const metadata = { title: "Automations · Settings" };

export default async function AutomationsSettingsPage() {
  const statusSettings = await readStatusSettings();
  return <AutomationRules statusSettings={statusSettings} />;
}
