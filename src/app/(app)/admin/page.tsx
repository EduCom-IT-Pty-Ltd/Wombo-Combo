import { getSession } from "@/lib/auth/session";
import { AUTOMATION_RULES } from "@/lib/domain/automation";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { StatusFlowSettings } from "@/components/admin/status-flow-settings";
import { readOrganisationSettings, readQuoteDocumentTemplateSettings, readRolePermissions, readStatusFieldTemplates, readStatusSettings, readStatusTaskTemplates } from "@/lib/data/local-store";
import { OrganisationSettingsForm } from "@/components/admin/organisation-settings";
import { RolePermissionsManager } from "@/components/admin/role-permissions-manager";
import { QuoteLetterheadDesigner } from "@/components/admin/quote-letterhead-designer";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await getSession();
  const [statusSettings, statusTaskTemplates, statusFieldTemplates, organisation, rolePermissions, quoteTemplate] = await Promise.all([readStatusSettings(), readStatusTaskTemplates(), readStatusFieldTemplates(), readOrganisationSettings(), readRolePermissions(), readQuoteDocumentTemplateSettings()]);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Organisation settings, status flow, roles and automation rules" />

      <StatusFlowSettings settings={statusSettings} templates={statusTaskTemplates} fields={statusFieldTemplates} />

      <OrganisationSettingsForm settings={organisation} isDemo={session.isDemo} />

      <QuoteLetterheadDesigner settings={quoteTemplate} />

      <Card>
        <CardHeader
          title="Automation rules"
          description="Derived from the workflow specification. Runs on the matching trigger."
        />
        <ul className="divide-y divide-border-subtle">
          {AUTOMATION_RULES.map((rule) => (
            <li key={rule.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{rule.on}</span>
                <Badge tone="blue">{rule.effects.length} effects</Badge>
              </div>
              <p className="mt-1 text-sm">{rule.describedAs}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {rule.effects.map((effect, i) => (
                  <li
                    key={i}
                    className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {effect.type}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <RolePermissionsManager overrides={rolePermissions} />
    </div>
  );
}
