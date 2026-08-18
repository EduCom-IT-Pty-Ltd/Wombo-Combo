import { ArrowRight, CheckCircle2, CircleDashed, Clock3, Zap } from "lucide-react";
import { AUTOMATION_RULES, type AutomationEffect, type AutomationTriggerKind } from "@/lib/domain/automation";
import { STATUS_META, type ProjectStatus } from "@/lib/domain/status";
import type { StatusSetting } from "@/lib/domain/status-settings";
import { Badge, Card } from "@/components/ui";

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

type AutomationAvailability = "live" | "partial" | "planned";

const AVAILABILITY: Record<string, { state: AutomationAvailability; detail: string }> = {
  "new-project-scaffold": {
    state: "live",
    detail: "The project number and SharePoint project folder are created automatically when a new project is saved.",
  },
  "request-purchase-order": {
    state: "planned",
    detail: "Quote acceptance is not yet connected to this workflow.",
  },
  "po-unblocks-scheduling": {
    state: "planned",
    detail: "Recording a purchase order is not yet connected to this workflow.",
  },
  "notify-on-schedule": {
    state: "partial",
    detail: "The workflow is detected when a job is scheduled, but installer and customer notifications are not sent yet.",
  },
  "raise-qa-inspection": {
    state: "partial",
    detail: "A “Complete QA inspection” task is added automatically. The status change, inspection and notification steps are still planned.",
  },
  "issue-completion-certificate": {
    state: "planned",
    detail: "Passing QA is not yet connected to automatic certificate generation or customer notification.",
  },
  "export-to-xero": {
    state: "planned",
    detail: "Final costing is not yet connected to automatic Xero export or finance notification.",
  },
  "close-on-payment": {
    state: "planned",
    detail: "Invoice payments are not yet connected to automatically closing the project.",
  },
};

function AvailabilityBadge({ state }: { state: AutomationAvailability }) {
  if (state === "live") {
    return <Badge tone="emerald"><CheckCircle2 className="size-3" />Live</Badge>;
  }
  if (state === "partial") {
    return <Badge tone="amber"><CircleDashed className="size-3" />Partially live</Badge>;
  }
  return <Badge tone="slate"><Clock3 className="size-3" />Planned</Badge>;
}

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
      <div className="border-b border-border-subtle px-4 py-4">
        <p className="text-sm font-semibold text-foreground">Automation availability</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          These rules are shown for visibility only. The labels below show what is working in the live portal today and
          what is still planned.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <AvailabilityBadge state="live" />
          <AvailabilityBadge state="partial" />
          <AvailabilityBadge state="planned" />
        </div>
      </div>
      <ul className="divide-y divide-border-subtle">
        {AUTOMATION_RULES.map((rule) => {
          const availability = AVAILABILITY[rule.id];
          return (
            <li key={rule.id} className="px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                  <Zap className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                  <span>When {TRIGGER_LABELS[rule.on]}</span>
                </p>
                <AvailabilityBadge state={availability.state} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:pl-6">{availability.detail}</p>
              <ul className="mt-3 space-y-1.5 sm:pl-6">
                {rule.effects.map((effect, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{describeEffect(effect, statusSettings)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
