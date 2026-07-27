import type { ProjectStatus } from "@/lib/db/schema/enums";
import { PROJECT_STATUSES } from "@/lib/db/schema/enums";

export type { ProjectStatus };
export { PROJECT_STATUSES };

export type StatusGroup = "pre_sale" | "pre_start" | "delivery" | "close_out" | "terminal";

export interface StatusMeta {
  status: ProjectStatus;
  label: string;
  group: StatusGroup;
  /** Owning module — used to pick the default tab when you open the project. */
  module: "crm" | "quoting" | "scheduling" | "field" | "qa" | "finance";
  description: string;
  /** Tailwind token pair, resolved in `src/components/ui/status-badge.tsx`. */
  tone: "slate" | "amber" | "blue" | "violet" | "emerald" | "rose";
  /** Whether the job counts towards active work-in-progress metrics. */
  isActive: boolean;
}

export const STATUS_META: Record<ProjectStatus, StatusMeta> = {
  new_request: {
    status: "new_request",
    label: "Request Received",
    group: "pre_sale",
    module: "crm",
    description: "Customer, site, scope and attachments captured.",
    tone: "slate",
    isActive: true,
  },
  quoting: {
    status: "quoting",
    label: "Quoting",
    group: "pre_sale",
    module: "quoting",
    description: "Labour, materials and supplier costs being estimated.",
    tone: "amber",
    isActive: true,
  },
  quote_sent: {
    status: "quote_sent",
    label: "Uplift Sent",
    group: "pre_sale",
    module: "quoting",
    description: "Quote issued to the customer.",
    tone: "amber",
    isActive: true,
  },
  awaiting_approval: {
    status: "awaiting_approval",
    label: "Awaiting Approval",
    group: "pre_sale",
    module: "quoting",
    description: "Customer reviewing. Follow-up cadence applies.",
    tone: "amber",
    isActive: true,
  },
  approved: {
    status: "approved",
    label: "PO Received",
    group: "pre_start",
    module: "finance",
    description: "Quote accepted. Purchase order and deposit outstanding.",
    tone: "blue",
    isActive: true,
  },
  waiting_for_scheduling: {
    status: "waiting_for_scheduling",
    label: "Scheduling Pending",
    group: "pre_start",
    module: "scheduling",
    description: "PO received. Queued for the scheduling board.",
    tone: "blue",
    isActive: true,
  },
  scheduled: {
    status: "scheduled",
    label: "Job Scheduled",
    group: "pre_start",
    module: "scheduling",
    description: "Installers allocated and notified.",
    tone: "violet",
    isActive: true,
  },
  in_progress: {
    status: "in_progress",
    label: "Installation in Progress",
    group: "delivery",
    module: "field",
    description: "Crew on site. Time, materials and photos being captured.",
    tone: "violet",
    isActive: true,
  },
  installation_complete: {
    status: "installation_complete",
    label: "Installation Complete",
    group: "delivery",
    module: "field",
    description: "Install signed off by the crew. QA task raised automatically.",
    tone: "violet",
    isActive: true,
  },
  qa: {
    status: "qa",
    label: "QA Complete",
    group: "close_out",
    module: "qa",
    description: "Inspection checklist in progress. Defects tracked to closure.",
    tone: "emerald",
    isActive: true,
  },
  final_costing: {
    status: "final_costing",
    label: "Ready to Invoice",
    group: "close_out",
    module: "finance",
    description: "Labour, materials and variations collated into profitability.",
    tone: "emerald",
    isActive: true,
  },
  ready_for_invoice: {
    status: "ready_for_invoice",
    label: "Certificate Issued",
    group: "close_out",
    module: "finance",
    description: "Costing locked. Queued for export to Xero.",
    tone: "emerald",
    isActive: true,
  },
  closed: {
    status: "closed",
    label: "Complete",
    group: "terminal",
    module: "finance",
    description: "Invoice paid and project financially closed.",
    tone: "slate",
    isActive: false,
  },
  on_hold: {
    status: "on_hold",
    label: "On Hold",
    group: "terminal",
    module: "crm",
    description: "Paused. Resumes at the status it was held from.",
    tone: "amber",
    isActive: false,
  },
  lost: {
    status: "lost",
    label: "Lost",
    group: "terminal",
    module: "quoting",
    description: "Quote declined or the customer went elsewhere.",
    tone: "rose",
    isActive: false,
  },
  cancelled: {
    status: "cancelled",
    label: "Cancelled",
    group: "terminal",
    module: "crm",
    description: "Withdrawn before completion.",
    tone: "rose",
    isActive: false,
  },
};

/** The happy path, in order. Drives the pipeline board and the stepper. */
export const PIPELINE_ORDER: ProjectStatus[] = [
  "new_request",
  "quote_sent",
  "quoting",
  "approved",
  "waiting_for_scheduling",
  "scheduled",
  "in_progress",
  "installation_complete",
  "qa",
  "final_costing",
  "ready_for_invoice",
  "closed",
];

export const TERMINAL_STATUSES: ProjectStatus[] = ["closed", "lost", "cancelled"];

/**
 * Explicit transition table. Anything not listed is rejected — no "any status to
 * any status" escape hatch, because the automations below assume the edges.
 */
const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  new_request: ["quoting", "on_hold", "lost", "cancelled"],
  quoting: ["quote_sent", "new_request", "on_hold", "lost", "cancelled"],
  quote_sent: ["awaiting_approval", "approved", "quoting", "on_hold", "lost", "cancelled"],
  awaiting_approval: ["approved", "quoting", "on_hold", "lost", "cancelled"],
  approved: ["waiting_for_scheduling", "quoting", "on_hold", "cancelled"],
  waiting_for_scheduling: ["scheduled", "approved", "on_hold", "cancelled"],
  scheduled: ["in_progress", "waiting_for_scheduling", "on_hold", "cancelled"],
  in_progress: ["installation_complete", "scheduled", "on_hold", "cancelled"],
  installation_complete: ["qa", "in_progress"],
  // A failed inspection sends the job back to the crew for rectification.
  qa: ["final_costing", "in_progress"],
  final_costing: ["ready_for_invoice", "qa"],
  ready_for_invoice: ["closed", "final_costing"],
  closed: [],
  // Resolved at runtime to `heldFromStatus`; see `allowedTransitions`.
  on_hold: [],
  lost: ["quoting"],
  cancelled: [],
};

/**
 * Facts about a project that guards are evaluated against. Assembled once by
 * the caller so guard evaluation stays a pure function — easy to unit test and
 * safe to run on the client for optimistic UI.
 */
export interface TransitionContext {
  hasInternallyApprovedQuote: boolean;
  hasAcceptedQuote: boolean;
  hasPurchaseOrder: boolean;
  depositSatisfied: boolean;
  hasConfirmedAssignment: boolean;
  hasScheduledDates: boolean;
  allInstallTasksDone: boolean;
  qaPassed: boolean;
  openCriticalDefects: number;
  costingFinalised: boolean;
  invoicePaid: boolean;
}

export const EMPTY_CONTEXT: TransitionContext = {
  hasInternallyApprovedQuote: false,
  hasAcceptedQuote: false,
  hasPurchaseOrder: false,
  depositSatisfied: true,
  hasConfirmedAssignment: false,
  hasScheduledDates: false,
  allInstallTasksDone: false,
  qaPassed: false,
  openCriticalDefects: 0,
  costingFinalised: false,
  invoicePaid: false,
};

export interface Guard {
  /** Shown to the user as the reason the transition is unavailable. */
  requirement: string;
  satisfied: (ctx: TransitionContext) => boolean;
  /** Soft guards warn but still permit the move (with an override reason). */
  severity: "block" | "warn";
}

/** Entry requirements, keyed by the status being entered. */
const GUARDS: Partial<Record<ProjectStatus, Guard[]>> = {
  quote_sent: [
    {
      requirement: "A quote must be internally approved before it is issued",
      satisfied: (c) => c.hasInternallyApprovedQuote,
      severity: "block",
    },
  ],
  approved: [
    {
      requirement: "Record the customer's acceptance against a quote version",
      satisfied: (c) => c.hasAcceptedQuote,
      severity: "block",
    },
  ],
  waiting_for_scheduling: [
    {
      requirement: "Purchase order received and attached",
      satisfied: (c) => c.hasPurchaseOrder,
      severity: "block",
    },
    {
      requirement: "Deposit received",
      satisfied: (c) => c.depositSatisfied,
      severity: "warn",
    },
  ],
  scheduled: [
    {
      requirement: "At least one installer allocated and confirmed",
      satisfied: (c) => c.hasConfirmedAssignment,
      severity: "block",
    },
    {
      requirement: "Start and finish dates set",
      satisfied: (c) => c.hasScheduledDates,
      severity: "block",
    },
  ],
  installation_complete: [
    {
      requirement: "All installation tasks closed out",
      satisfied: (c) => c.allInstallTasksDone,
      severity: "warn",
    },
  ],
  final_costing: [
    {
      requirement: "QA inspection passed",
      satisfied: (c) => c.qaPassed,
      severity: "block",
    },
    {
      requirement: "No open critical defects",
      satisfied: (c) => c.openCriticalDefects === 0,
      severity: "block",
    },
  ],
  ready_for_invoice: [
    {
      requirement: "Final costing signed off",
      satisfied: (c) => c.costingFinalised,
      severity: "block",
    },
  ],
  closed: [
    {
      requirement: "Invoice marked paid in Xero",
      satisfied: (c) => c.invoicePaid,
      severity: "warn",
    },
  ],
};

export function allowedTransitions(from: ProjectStatus, heldFrom?: ProjectStatus | null): ProjectStatus[] {
  if (from === "on_hold") {
    // Resume where we paused; fall back to the top of the pipeline if unknown.
    const resume = heldFrom ?? "new_request";
    return [resume, "cancelled", "lost"].filter((s, i, a) => a.indexOf(s) === i) as ProjectStatus[];
  }
  return TRANSITIONS[from];
}

export interface TransitionCheck {
  allowed: boolean;
  /** Present when the edge itself is invalid rather than a guard failing. */
  reason?: string;
  blockers: Guard[];
  warnings: Guard[];
}

export function checkTransition(
  from: ProjectStatus,
  to: ProjectStatus,
  ctx: TransitionContext = EMPTY_CONTEXT,
  heldFrom?: ProjectStatus | null,
): TransitionCheck {
  if (from === to) {
    return { allowed: false, reason: "Project is already at this status", blockers: [], warnings: [] };
  }
  if (!allowedTransitions(from, heldFrom).includes(to)) {
    return {
      allowed: false,
      reason: `${STATUS_META[from].label} cannot move directly to ${STATUS_META[to].label}`,
      blockers: [],
      warnings: [],
    };
  }
  const guards = GUARDS[to] ?? [];
  const unmet = guards.filter((g) => !g.satisfied(ctx));
  const blockers = unmet.filter((g) => g.severity === "block");
  const warnings = unmet.filter((g) => g.severity === "warn");
  return { allowed: blockers.length === 0, blockers, warnings };
}

/** 0..1 progress through the happy path, for progress bars. */
export function pipelineProgress(status: ProjectStatus): number {
  const index = PIPELINE_ORDER.indexOf(status);
  if (index === -1) return 0;
  return index / (PIPELINE_ORDER.length - 1);
}

export function isTerminal(status: ProjectStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
