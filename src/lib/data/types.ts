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
  color?: string | null;
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
  priceListId?: string | null;
  defaultProjectTemplateId?: string | null;
}

/** Local organisation profile until the production organisation table is wired up. */
export interface OrganisationSettings {
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  projectNumberPrefix: string;
  logoUrl: string | null;
}

export interface CatalogueMaterial {
  id: string;
  /** Product family, e.g. “Enviroseal Wall Wrap”. */
  name: string;
  /** Optional selectable product variant, e.g. “Aero 1200”. */
  variation: string | null;
  /** Doubles as the Xero item code on rows that came from Xero. */
  sku: string;
  description: string | null;
  costCentsPerM2: number;
  standardPriceCentsPerM2: number;
  /**
   * Set when this row mirrors a Xero item. Only then may `sku` be sent to Xero
   * as an `ItemCode` — Xero rejects a code it does not recognise.
   */
  xeroItemId?: string | null;
}

export interface CustomerPriceList {
  id: string;
  name: string;
  entries: Array<{ materialId: string; priceCentsPerM2: number }>;
}

/** Organisation-wide labour and subcontractor cost settings for the local prototype. */
export interface LabourSettings {
  standardLabourEnabled: boolean;
  /** Single budgeted cost per employee for an entire job, in cents. */
  standardLabourCostCentsPerEmployee: number;
  /** Rate paid to a subcontractor for each quoted m² of a catalogue material. */
  subcontractorMaterialRates: Array<{ materialId: string; costCentsPerM2: number }>;
}

/** Costing choices made per project. */
export interface ProjectCostingOptions {
  standardLabourEnabled: boolean;
  employeeCount: number;
  includeSubcontractorMaterialCosts: boolean;
}

/** A reusable production model. Material quantities can be adjusted per quote. */
export interface ProductionTemplate {
  id: string;
  name: string;
  description: string | null;
  materials: Array<{
    /** The default (or fixed) catalogue variant. */
    materialId: string;
    /** Stored so a quote can offer all catalogue variations of this product. */
    mainMaterialName: string;
    defaultQuantity: number;
    /** When true, the quote author chooses the variation before it is added. */
    allowVariationChoice: boolean;
  }>;
}

/** A starting point for a project workflow. */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  startingStatus: ProjectStatus;
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
  /** Set once the quote has been pushed to Xero. */
  xeroQuoteId?: string | null;
  xeroQuoteNumber?: string | null;
  xeroQuoteStatus?: string | null;
  xeroLastError?: string | null;
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

/** A simple scheduled piece of work for a project. */
export interface SchedulePhase {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  userId: string;
  date: string; // YYYY-MM-DD
  /** Present when this Call-Up was created by the QA inspection scheduler. */
  inspectionId?: string | null;
}

export interface SchedulePhaseView extends SchedulePhase {
  projectNumber: string;
  projectTitle: string;
  siteLabel: string | null;
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
  /** A live field shift may be paused; paused time is added to breakMinutes. */
  pausedAt?: string | null;
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
  /**
   * Where the bytes can be fetched. Null until the file itself is stored —
   * TODO(sharepoint): this becomes the Graph download URL for the item in the
   * project's document library, resolved per-request against the caller's org.
   */
  url?: string | null;
  /** Free-text note shown under the file name. Explains why the file is here. */
  note?: string | null;
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
  required: boolean;
  value: string;
  updatedAt: string | null;
}
