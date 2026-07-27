import { getSession } from "@/lib/auth/session";
import { AUTOMATION_RULES } from "@/lib/domain/automation";
import { CAPABILITIES, ROLE_LABELS, capabilitiesFor } from "@/lib/domain/permissions";
import { ROLES } from "@/lib/db/schema/enums";
import { Badge, Card, CardHeader, Field, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await getSession();

  return (
    <div className="space-y-4">
      <PageHeader title="Admin" description="Organisation settings, roles and automation rules" />

      <Card>
        <CardHeader title="Organisation" />
        <dl className="px-4 py-1">
          <Field label="Name">{session.org.name}</Field>
          <Field label="Slug">{session.org.slug}</Field>
          <Field label="Project prefix">
            <span className="font-mono">{session.org.projectNumberPrefix}-2026-0001</span>
          </Field>
          <Field label="Currency">{session.org.currency}</Field>
          <Field label="Timezone">{session.org.timezone}</Field>
          <Field label="Authentication">
            {session.isDemo ? (
              <>
                <Badge tone="amber">Demo session</Badge>
                <span className="ml-2 text-xs text-muted-foreground">
                  WorkOS not connected — see src/lib/auth/session.ts
                </span>
              </>
            ) : (
              <Badge tone="emerald">WorkOS</Badge>
            )}
          </Field>
        </dl>
      </Card>

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

      <Card>
        <CardHeader title="Roles & permissions" description="Capability matrix — the source of truth for access" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="sticky left-0 bg-surface px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Capability
                </th>
                {ROLES.map((role) => (
                  <th key={role} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">
                    <span className="block max-w-16 truncate">{ROLE_LABELS[role]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {CAPABILITIES.map((capability) => (
                <tr key={capability}>
                  <td className="sticky left-0 bg-surface px-4 py-1.5 font-mono text-xs">{capability}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-2 py-1.5 text-center">
                      {capabilitiesFor(role).includes(capability) ? (
                        <span className="text-[var(--tone-emerald-fg)]">●</span>
                      ) : (
                        <span className="text-border-strong">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
