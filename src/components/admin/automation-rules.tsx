import { ArrowRight, Zap } from "lucide-react";
import { AUTOMATION_RULES, type AutomationEffect, type AutomationTriggerKind } from "@/lib/domain/automation";
import { STATUS_META, type ProjectStatus } from "@/lib/domain/status";
import type { StatusSetting } from "@/lib/domain/status-settings";
import { Card } from "@/components/ui";

/**
 * Read-only: the rules come from the workflow specification, not from a form.
 * They are still worth showing in plain English so nobody has to guess why a
 * project moved on its own.
 */

const TRIGGER_LABELS: Record<AutomationTriggerKind, string> = {
  "project.created": "a project is created",
  "quote.accepted": "a quote is accepted",
  "purchase_order.received": "a purchase order is received",
  "project.scheduled": "a job is scheduled",
  "installation.completed": "an installation is marked complete",
  "qa.passed": "a QA inspection passes",
  "costing.finalised": "final costing is signed off",
  "invoice.paid": "an invoice is paid",
};

const AUDIENCE_LABELS = {
  installers: "the installers",
  customer: "the customer",
  project_manager: "the project manager",
  finance: "the finance team",
} as const;

function statusLabel(status: ProjectStatus, settings: StatusSetting[]) {
  return settings.find((setting) => setting.status === status)?.label ?? STATUS_META[status].label;
}

function describeEffect(effect: AutomationEffect, settings: StatusSetting[]): string {
  switch (effect.type) {
    case "assign_project_number":
      return "Give the project its next project number";
    case "create_document_folder":
      return "Create the project's document folder";
    case "create_task":
      return effect.dueInDays
        ? `Add the task “${effect.title}”, due in ${effect.dueInDays} days`
        : `Add the task “${effect.title}”`;
    case "set_status":
      return `Move the project to ${statusLabel(effect.to, settings)}`;
    case "notify":
      return `Notify ${AUDIENCE_LABELS[effect.audience]}`;
    case "create_inspection":
      return "Raise the QA inspection";
    case "generate_completion_certificate":
      return "Generate the completion certificate";
    case "queue_invoice_export":
      return "Queue the invoice details for Xero";
    case "mark_financially_complete":
      return "Mark the project financially complete";
  }
}

export function AutomationRules({ statusSettings }: { statusSettings: StatusSetting[] }) {
  return (
    <Card>
      <p className="border-b border-border-subtle px-4 py-3 text-xs text-muted-foreground">
        These run on their own — there is nothing to switch on. They are listed so you know what the portal does behind
        the scenes.
      </p>
      <ul className="divide-y divide-border-subtle">
        {AUTOMATION_RULES.map((rule) => (
          <li key={rule.id} className="px-4 py-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
              <Zap className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
              <span>
                When {TRIGGER_LABELS[rule.on]}
              </span>
            </p>
            <ul className="mt-2 space-y-1.5 sm:pl-6">
              {rule.effects.map((effect, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{describeEffect(effect, statusSettings)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
