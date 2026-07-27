import type { ProjectStatus } from "@/lib/db/schema/enums";

export interface StatusSetting {
  status: ProjectStatus;
  label: string;
  color: string;
  position: number;
  inProgressFlow: boolean;
}

export interface StatusTaskTemplate {
  id: string;
  status: ProjectStatus;
  title: string;
  position: number;
}

export interface StatusFieldTemplate {
  id: string;
  status: ProjectStatus;
  label: string;
  position: number;
}

export interface WorkflowFieldValue {
  projectId: string;
  templateId: string;
  value: string;
  updatedAt: string;
}

/** The local default requested for the operational workflow. */
export const DEFAULT_STATUS_SETTINGS: StatusSetting[] = [
  { status: "new_request", label: "Request Received", color: "#64748b", position: 1, inProgressFlow: true },
  { status: "quote_sent", label: "Uplift Sent", color: "#d97706", position: 2, inProgressFlow: true },
  { status: "quoting", label: "Quoting", color: "#f59e0b", position: 3, inProgressFlow: true },
  { status: "approved", label: "PO Received", color: "#0284c7", position: 4, inProgressFlow: true },
  { status: "waiting_for_scheduling", label: "Scheduling Pending", color: "#2563eb", position: 5, inProgressFlow: true },
  { status: "scheduled", label: "Job Scheduled", color: "#7c3aed", position: 6, inProgressFlow: true },
  { status: "in_progress", label: "Installation in Progress", color: "#8b5cf6", position: 7, inProgressFlow: true },
  { status: "installation_complete", label: "Installation Complete", color: "#a855f7", position: 8, inProgressFlow: true },
  { status: "qa", label: "QA Complete", color: "#10b981", position: 9, inProgressFlow: true },
  { status: "final_costing", label: "Ready to Invoice", color: "#14b8a6", position: 10, inProgressFlow: true },
  { status: "ready_for_invoice", label: "Certificate Issued", color: "#059669", position: 11, inProgressFlow: true },
  { status: "closed", label: "Complete", color: "#334155", position: 12, inProgressFlow: true },
  { status: "lost", label: "Lost", color: "#dc2626", position: 13, inProgressFlow: false },
  { status: "cancelled", label: "Cancelled", color: "#991b1b", position: 14, inProgressFlow: false },
];

export const DEFAULT_STATUS_TASK_TEMPLATES: StatusTaskTemplate[] = [
  ["new_request", "Confirm scope and site details"],
  ["quote_sent", "Send uplift to the customer"],
  ["quoting", "Prepare quote and cost estimate"],
  ["approved", "Record the purchase order"],
  ["waiting_for_scheduling", "Confirm available installation dates"],
  ["scheduled", "Allocate and confirm installers"],
  ["in_progress", "Complete installation works"],
  ["installation_complete", "Capture completion photos and handover"],
  ["qa", "Complete the QA inspection"],
  ["final_costing", "Confirm final costs and margin"],
  ["ready_for_invoice", "Issue completion certificate"],
  ["closed", "Confirm invoice has been paid"],
].map(([status, title], index) => ({ id: `workflow-${status}`, status: status as ProjectStatus, title, position: index + 1 }));

export const DEFAULT_STATUS_FIELD_TEMPLATES: StatusFieldTemplate[] = [
  { id: "field-approved-1", status: "approved", label: "PO Number", position: 1 },
];

export function orderedFlow(settings: StatusSetting[]) {
  return settings.filter((setting) => setting.inProgressFlow).sort((a, b) => a.position - b.position);
}
