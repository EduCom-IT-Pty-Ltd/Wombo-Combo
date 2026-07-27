import type {
  AssignmentStatus,
  DefectSeverity,
  ProjectStatus,
  QaResult,
  QuoteStatus,
  Role,
  TaskKind,
  TaskStatus,
} from "@/lib/db/schema/enums";
import type { QuoteLineInput } from "@/lib/domain/quote";

/**
 * View models returned by the repository layer. Deliberately *not* the raw table
 * rows: screens want joined, denormalised shapes, and keeping that contract here
 * means swapping the demo store for Drizzle queries changes no component.
 */

export interface Person {
  id: string;
  name: string;
  initials: string;
  role: Role;
  email: string;
  isSchedulable: boolean;
  costRateCentsPerHour: number;
}

export interface Customer {
  id: string;
  name: string;
  accountType: string | null;
  abn: string | null;
  paymentTermsDays: number;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  siteCount: number;
  activeProjects: number;
  lifetimeValueCents: number;
}

export interface Site {
  id: string;
  customerId: string;
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  accessNotes: string | null;
}

export interface ProjectSummary {
  id: string;
  projectNumber: string;
  title: string;
  status: ProjectStatus;
  heldFromStatus: ProjectStatus | null;
  customerId: string;
  customerName: string;
  siteId: string | null;
  siteLabel: string | null;
  contractValueCents: number;
  quotedMarginPct: number;
  projectManagerId: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  poNumber: string | null;
  updatedAt: string;
  /** Counts driving the list-row badges. */
  openTasks: number;
  openDefects: number;
  assignedInstallerIds: string[];
}

export interface ProjectDetail extends ProjectSummary {
  scopeOfWorks: string | null;
  initialNotes: string | null;
  depositRequiredCents: number | null;
  depositReceivedAt: string | null;
  poReceivedAt: string | null;
  requestedStartOn: string | null;
  installationCompletedAt: string | null;
  site: Site | null;
  customer: Customer;
}

export interface QuoteSummary {
  id: string;
  projectId: string;
  reference: string;
  version: number;
  status: QuoteStatus;
  totalCents: number;
  subtotalSellCents: number;
  subtotalCostCents: number;
  marginPct: number;
  taxRatePct: number;
  validUntil: string | null;
  sentAt: string | null;
  preparedById: string | null;
  lines: QuoteLineInput[];
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  assigneeId: string | null;
  dueOn: string | null;
  createdByAutomation: string | null;
  /** Present for a task created from a configurable project-status checklist. */
  workflowStatus?: ProjectStatus | null;
  workflowTemplateId?: string | null;
  completedAt?: string | null;
}

export interface Assignment {
  id: string;
  projectId: string;
  projectNumber: string;
  projectTitle: string;
  siteLabel: string | null;
  userId: string;
  status: AssignmentStatus;
  startsAt: string;
  endsAt: string;
  role: string | null;
}

export interface LeaveEntry {
  id: string;
  userId: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  costRateCentsPerHour: number;
  notes: string | null;
}

export interface MaterialUse {
  id: string;
  projectId: string;
  description: string;
  quantity: number;
  unit: string;
  unitCostCents: number;
  recordedById: string | null;
  recordedAt: string;
}

export interface Variation {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  status: string;
  estimatedCostCents: number;
  quotedSellCents: number;
}

export interface DocumentRecord {
  id: string;
  projectId: string | null;
  name: string;
  kind: string;
  sizeBytes: number;
  version: number;
  requiresAcknowledgement: boolean;
  uploadedAt: string;
  uploadedById: string | null;
}

export interface Inspection {
  id: string;
  projectId: string;
  result: QaResult;
  inspectorId: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  items: Array<{
    id: string;
    prompt: string;
    isCritical: boolean;
    passed: boolean | null;
    comment: string | null;
  }>;
}

export interface Defect {
  id: string;
  projectId: string;
  title: string;
  severity: DefectSeverity;
  assigneeId: string | null;
  dueOn: string | null;
  resolvedAt: string | null;
}

export interface ProjectEvent {
  id: string;
  projectId: string;
  type: string;
  summary: string;
  actorId: string | null;
  occurredAt: string;
}

export interface WorkflowField {
  id: string;
  label: string;
  value: string;
  updatedAt: string | null;
}
