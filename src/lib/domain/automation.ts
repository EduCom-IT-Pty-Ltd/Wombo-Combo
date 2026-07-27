import type { ProjectStatus } from "./status";

/**
 * The spec's "Automation Opportunities" table, made executable.
 *
 * Rules are declared as data and dispatched by `runAutomations`. Handlers are
 * injected rather than imported so this module stays pure and testable, and so
 * the same rule set can run inline (server action) or deferred (queue/webhook)
 * without being rewritten.
 */

export type AutomationTrigger =
  | { kind: "project.created"; projectId: string }
  | { kind: "quote.accepted"; projectId: string; quoteId: string }
  | { kind: "purchase_order.received"; projectId: string; poNumber: string }
  | { kind: "project.scheduled"; projectId: string }
  | { kind: "installation.completed"; projectId: string }
  | { kind: "qa.passed"; projectId: string; inspectionId: string }
  | { kind: "costing.finalised"; projectId: string }
  | { kind: "invoice.paid"; projectId: string; invoiceExportId: string };

export type AutomationTriggerKind = AutomationTrigger["kind"];

/**
 * What a rule wants done. Effects are described, not performed — the executor
 * decides whether to run them now, enqueue them, or (in demo mode) log them.
 */
export type AutomationEffect =
  | { type: "assign_project_number" }
  | { type: "create_document_folder" }
  | { type: "create_task"; title: string; kind: "admin" | "qa" | "procurement" | "install"; dueInDays?: number }
  | { type: "set_status"; to: ProjectStatus }
  | { type: "notify"; audience: "installers" | "customer" | "project_manager" | "finance"; template: string }
  | { type: "create_inspection"; templateHint: string }
  | { type: "generate_completion_certificate" }
  | { type: "queue_invoice_export" }
  | { type: "mark_financially_complete" };

export interface AutomationRule {
  id: string;
  on: AutomationTriggerKind;
  /** Mirrors the spec wording so the table stays traceable to the document. */
  describedAs: string;
  effects: AutomationEffect[];
}

export const AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "new-project-scaffold",
    on: "project.created",
    describedAs: "New project → create project folder and project number.",
    effects: [{ type: "assign_project_number" }, { type: "create_document_folder" }],
  },
  {
    id: "request-purchase-order",
    on: "quote.accepted",
    describedAs: "Quote approved → request Purchase Order.",
    effects: [
      { type: "set_status", to: "approved" },
      { type: "create_task", title: "Request purchase order from customer", kind: "admin", dueInDays: 2 },
      { type: "notify", audience: "customer", template: "purchase-order-request" },
    ],
  },
  {
    id: "po-unblocks-scheduling",
    on: "purchase_order.received",
    describedAs: "PO received → move to Waiting for Scheduling.",
    effects: [
      { type: "set_status", to: "waiting_for_scheduling" },
      { type: "notify", audience: "project_manager", template: "ready-to-schedule" },
    ],
  },
  {
    id: "notify-on-schedule",
    on: "project.scheduled",
    describedAs: "Job scheduled → notify installer and customer.",
    effects: [
      { type: "notify", audience: "installers", template: "job-allocated" },
      { type: "notify", audience: "customer", template: "install-date-confirmed" },
    ],
  },
  {
    id: "raise-qa-inspection",
    on: "installation.completed",
    describedAs: "Installation complete → create QA task.",
    effects: [
      { type: "set_status", to: "qa" },
      { type: "create_inspection", templateHint: "standard-install-qa" },
      { type: "create_task", title: "Complete QA inspection", kind: "qa", dueInDays: 3 },
      { type: "notify", audience: "project_manager", template: "qa-required" },
    ],
  },
  {
    id: "issue-completion-certificate",
    on: "qa.passed",
    describedAs: "QA passed → generate Completion Certificate.",
    effects: [
      { type: "generate_completion_certificate" },
      { type: "set_status", to: "final_costing" },
      { type: "notify", audience: "customer", template: "completion-certificate" },
    ],
  },
  {
    id: "export-to-xero",
    on: "costing.finalised",
    describedAs: "Final costing complete → send invoice details to Xero.",
    effects: [
      { type: "set_status", to: "ready_for_invoice" },
      { type: "queue_invoice_export" },
      { type: "notify", audience: "finance", template: "invoice-ready" },
    ],
  },
  {
    id: "close-on-payment",
    on: "invoice.paid",
    describedAs: "Invoice paid → mark project financially complete.",
    effects: [{ type: "mark_financially_complete" }, { type: "set_status", to: "closed" }],
  },
];

export function rulesFor(kind: AutomationTriggerKind): AutomationRule[] {
  return AUTOMATION_RULES.filter((r) => r.on === kind);
}

export interface AutomationRun {
  ruleId: string;
  trigger: AutomationTrigger;
  effects: AutomationEffect[];
}

/** Resolves a trigger into the concrete work to perform. Pure. */
export function planAutomations(trigger: AutomationTrigger): AutomationRun[] {
  return rulesFor(trigger.kind).map((rule) => ({
    ruleId: rule.id,
    trigger,
    effects: rule.effects,
  }));
}

export type EffectExecutor = (effect: AutomationEffect, trigger: AutomationTrigger) => Promise<void>;

/**
 * Executes a plan. Effects run in declaration order and failures are collected
 * rather than thrown: an automation that cannot notify a customer must not roll
 * back the status change that a human just made.
 */
export async function runAutomations(
  trigger: AutomationTrigger,
  execute: EffectExecutor,
): Promise<{ ran: AutomationRun[]; errors: Array<{ ruleId: string; error: unknown }> }> {
  const plan = planAutomations(trigger);
  const errors: Array<{ ruleId: string; error: unknown }> = [];

  for (const run of plan) {
    for (const effect of run.effects) {
      try {
        await execute(effect, trigger);
      } catch (error) {
        errors.push({ ruleId: run.ruleId, error });
      }
    }
  }
  return { ran: plan, errors };
}
