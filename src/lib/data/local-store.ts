import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as seed from "./demo-data";
import type {
  Customer,
  CatalogueMaterial,
  CustomerPriceList,
  Defect,
  DocumentRecord,
  Inspection,
  ProjectDetail,
  ProjectEvent,
  Site,
  Task,
} from "./types";
import type { AutomationEffect, AutomationTrigger } from "@/lib/domain/automation";
import type { ProjectStatus } from "@/lib/domain/status";
import { DEFAULT_STATUS_FIELD_TEMPLATES, DEFAULT_STATUS_SETTINGS, DEFAULT_STATUS_TASK_TEMPLATES, type StatusFieldTemplate, type StatusSetting, type StatusTaskTemplate, type WorkflowFieldValue } from "@/lib/domain/status-settings";

/**
 * A deliberately small, file-backed store for local demo use. It keeps the
 * repository contract identical to the future Drizzle implementation, while
 * making the prototype behave like a real app between browser refreshes.
 *
 * It is ignored by Git and is never used when DATABASE_URL is configured.
 */
export type LocalStore = {
  people: typeof seed.people;
  customers: Customer[];
  sites: Site[];
  projects: ProjectDetail[];
  quotes: typeof seed.quotes;
  tasks: Task[];
  assignments: typeof seed.assignments;
  leave: typeof seed.leave;
  timeEntries: typeof seed.timeEntries;
  materials: typeof seed.materials;
  variations: typeof seed.variations;
  documents: DocumentRecord[];
  inspections: Inspection[];
  defects: Defect[];
  events: ProjectEvent[];
  statusSettings: StatusSetting[];
  statusTaskTemplates: StatusTaskTemplate[];
  statusFieldTemplates: StatusFieldTemplate[];
  workflowFieldValues: WorkflowFieldValue[];
  catalogueMaterials: CatalogueMaterial[];
  customerPriceLists: CustomerPriceList[];
};

const storePath = join(process.cwd(), ".wombo-data", "test-data.json");

function freshStore(): LocalStore {
  return structuredClone({
    people: seed.people,
    customers: seed.customers,
    sites: seed.sites,
    projects: seed.projects,
    quotes: seed.quotes,
    tasks: seed.tasks,
    assignments: seed.assignments,
    leave: seed.leave,
    timeEntries: seed.timeEntries,
    materials: seed.materials,
    variations: seed.variations,
    documents: seed.documents,
    inspections: seed.inspections,
    defects: seed.defects,
    events: seed.events,
    statusSettings: DEFAULT_STATUS_SETTINGS,
    statusTaskTemplates: DEFAULT_STATUS_TASK_TEMPLATES,
    statusFieldTemplates: DEFAULT_STATUS_FIELD_TEMPLATES,
    workflowFieldValues: [],
    catalogueMaterials: [],
    customerPriceLists: [],
  });
}

export async function readLocalStore(): Promise<LocalStore> {
  try {
    const store = JSON.parse(await readFile(storePath, "utf8")) as Partial<LocalStore>;
    const savedSettings = store.statusSettings ?? structuredClone(DEFAULT_STATUS_SETTINGS);
    // Lost and Cancelled are fixed off-ramps, separate from the normal progress flow.
    const statusSettings = savedSettings.map((setting) =>
      setting.status === "lost" || setting.status === "cancelled" ? { ...setting, inProgressFlow: false } : setting,
    );
    const catalogueMaterials = (store.catalogueMaterials ?? []).map((material) => ({ ...material, standardPriceCentsPerM2: material.standardPriceCentsPerM2 ?? Math.round(material.costCentsPerM2 * 1.4) }));
    return { ...freshStore(), ...store, quotes: (store.quotes ?? []).filter((quote) => quote.id.startsWith("quote-")), statusSettings, statusTaskTemplates: store.statusTaskTemplates ?? structuredClone(DEFAULT_STATUS_TASK_TEMPLATES), statusFieldTemplates: store.statusFieldTemplates ?? structuredClone(DEFAULT_STATUS_FIELD_TEMPLATES), workflowFieldValues: store.workflowFieldValues ?? [], catalogueMaterials, customerPriceLists: store.customerPriceLists ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return freshStore();
    throw error;
  }
}

export async function readStatusSettings(): Promise<StatusSetting[]> {
  return (await readLocalStore()).statusSettings;
}

export async function saveStatusSettings(settings: StatusSetting[]) {
  await updateLocalStore((store) => {
    store.statusSettings = settings;
  });
}

export async function readStatusTaskTemplates(): Promise<StatusTaskTemplate[]> {
  return (await readLocalStore()).statusTaskTemplates;
}

export async function saveStatusTaskTemplates(templates: StatusTaskTemplate[]) {
  await updateLocalStore((store) => { store.statusTaskTemplates = templates; });
}

export async function readStatusFieldTemplates(): Promise<StatusFieldTemplate[]> {
  return (await readLocalStore()).statusFieldTemplates;
}

export async function saveStatusFieldTemplates(templates: StatusFieldTemplate[]) {
  await updateLocalStore((store) => { store.statusFieldTemplates = templates; });
}

export async function saveLocalWorkflowFieldValues(projectId: string, values: Array<{ templateId: string; value: string }>) {
  await updateLocalStore((store) => {
    for (const entry of values) {
      if (!store.statusFieldTemplates.some((template) => template.id === entry.templateId)) continue;
      const current = store.workflowFieldValues.find((value) => value.projectId === projectId && value.templateId === entry.templateId);
      const updatedAt = new Date().toISOString();
      if (current) { current.value = entry.value; current.updatedAt = updatedAt; }
      else store.workflowFieldValues.push({ projectId, templateId: entry.templateId, value: entry.value, updatedAt });
    }
  });
}

export async function setLocalWorkflowTaskComplete(args: { projectId: string; templateId: string; complete: boolean; completedAt?: string }) {
  await updateLocalStore((store) => {
    const template = store.statusTaskTemplates.find((item) => item.id === args.templateId);
    if (!template) throw new Error("Workflow task template not found");
    let task = store.tasks.find((item) => item.projectId === args.projectId && item.workflowTemplateId === args.templateId);
    if (!task) {
      addWorkflowTasks(store, args.projectId, template.status);
      task = store.tasks.find((item) => item.projectId === args.projectId && item.workflowTemplateId === args.templateId);
    }
    if (!task) throw new Error("Workflow task could not be created");
    task.status = args.complete ? "done" : "todo";
    task.completedAt = args.complete ? (args.completedAt ? new Date(args.completedAt).toISOString() : new Date().toISOString()) : null;
  });
}

export async function completeWorkflowTasksThrough(projectId: string, target: ProjectStatus) {
  await updateLocalStore((store) => {
    const flow = store.statusSettings.filter((item) => item.inProgressFlow).sort((a, b) => a.position - b.position);
    const targetIndex = flow.findIndex((item) => item.status === target);
    if (targetIndex < 0) return;
    for (const setting of flow.slice(0, targetIndex)) {
      addWorkflowTasks(store, projectId, setting.status);
      for (const task of store.tasks.filter((item) => item.projectId === projectId && item.workflowStatus === setting.status)) {
        task.status = "done";
        task.completedAt = new Date().toISOString();
      }
    }
  });
}

function addWorkflowTasks(store: LocalStore, projectId: string, status: ProjectStatus) {
  for (const template of store.statusTaskTemplates.filter((item) => item.status === status)) {
    if (store.tasks.some((task) => task.projectId === projectId && task.workflowTemplateId === template.id)) continue;
    store.tasks.push({ id: `task-${randomUUID()}`, projectId, title: template.title, kind: "admin", status: "todo", assigneeId: null, dueOn: null, createdByAutomation: null, workflowStatus: status, workflowTemplateId: template.id, completedAt: null });
  }
}

export async function updateLocalStore<T>(update: (store: LocalStore) => T): Promise<T> {
  const store = await readLocalStore();
  const result = update(store);
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  await rename(temporaryPath, storePath);
  return result;
}

function addEvent(store: LocalStore, projectId: string, summary: string, actorId: string | null = null) {
  store.events.push({
    id: `evt-${randomUUID()}`,
    projectId,
    type: "workflow",
    summary,
    actorId,
    occurredAt: new Date().toISOString(),
  });
}

export async function createLocalCustomer(input: {
  name: string;
  accountType?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  paymentTermsDays: number;
  priceListId?: string;
}): Promise<Customer> {
  return updateLocalStore((store) => {
    const customer: Customer = {
      id: `c-${randomUUID()}`,
      name: input.name,
      accountType: input.accountType || null,
      abn: null,
      paymentTermsDays: input.paymentTermsDays,
      primaryContactName: input.contactName || null,
      primaryContactEmail: input.contactEmail || null,
      primaryContactPhone: input.contactPhone || null,
      siteCount: 0,
      activeProjects: 0,
      lifetimeValueCents: 0,
      priceListId: input.priceListId || null,
    };
    store.customers.push(customer);
    return customer;
  });
}

export async function createLocalCatalogueMaterial(input: Omit<CatalogueMaterial, "id">) {
  return updateLocalStore((store) => {
    const material = { id: `mat-${randomUUID()}`, ...input };
    store.catalogueMaterials.push(material);
    return material;
  });
}

export async function createLocalPriceList(input: { name: string; entries: CustomerPriceList["entries"] }) {
  return updateLocalStore((store) => {
    const list = { id: `pl-${randomUUID()}`, ...input };
    store.customerPriceLists.push(list);
    return list;
  });
}

export async function updateLocalCatalogueMaterial(id: string, input: Omit<CatalogueMaterial, "id">) {
  await updateLocalStore((store) => { const material = store.catalogueMaterials.find((item) => item.id === id); if (!material) throw new Error("Material not found"); Object.assign(material, input); });
}
export async function deleteLocalCatalogueMaterial(id: string) {
  await updateLocalStore((store) => { store.catalogueMaterials = store.catalogueMaterials.filter((item) => item.id !== id); for (const list of store.customerPriceLists) list.entries = list.entries.filter((entry) => entry.materialId !== id); });
}
export async function updateLocalPriceList(id: string, input: { name: string; entries: CustomerPriceList["entries"] }) {
  await updateLocalStore((store) => { const list = store.customerPriceLists.find((item) => item.id === id); if (!list) throw new Error("Price list not found"); Object.assign(list, input); });
}
export async function deleteLocalPriceList(id: string) {
  await updateLocalStore((store) => { store.customerPriceLists = store.customerPriceLists.filter((item) => item.id !== id); for (const customer of store.customers) if (customer.priceListId === id) customer.priceListId = null; });
}

export async function createLocalMaterialQuote(args: { projectId: string; materialIds: Array<{ materialId: string; quantity: number }> }) {
  return updateLocalStore((store) => {
    const project = store.projects.find((item) => item.id === args.projectId);
    if (!project) throw new Error("Project not found");
    const priceList = project.customer.priceListId ? store.customerPriceLists.find((list) => list.id === project.customer.priceListId) : null;
    const version = Math.max(0, ...store.quotes.filter((quote) => quote.projectId === project.id).map((quote) => quote.version)) + 1;
    const lines = args.materialIds.map(({ materialId, quantity }) => {
      const material = store.catalogueMaterials.find((item) => item.id === materialId);
      if (!material) throw new Error("Material not found");
      const sell = priceList?.entries.find((entry) => entry.materialId === material.id)?.priceCentsPerM2 ?? material.standardPriceCentsPerM2;
      return { id: `ql-${randomUUID()}`, kind: "material" as const, description: material.name, quantity, unit: "m²", unitCostCents: material.costCentsPerM2, costCurrency: "AUD", fxRate: 1, marginPct: 28, unitSellCentsOverride: sell };
    });
    const subtotalSellCents = lines.reduce((sum, line) => sum + line.quantity * (line.unitSellCentsOverride ?? 0), 0);
    const subtotalCostCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
    const quote = { id: `quote-${randomUUID()}`, projectId: project.id, reference: `${project.projectNumber}-Q${version}`, version, status: "draft" as const, totalCents: Math.round(subtotalSellCents * 1.1), subtotalSellCents, subtotalCostCents, marginPct: subtotalSellCents ? ((subtotalSellCents - subtotalCostCents) / subtotalSellCents) * 100 : 0, taxRatePct: 10, validUntil: null, sentAt: null, preparedById: "u-sam", lines };
    store.quotes.push(quote);
    addEvent(store, project.id, `Quote ${quote.reference} created from the materials catalogue`);
    return quote;
  });
}

export async function createLocalProject(input: {
  title: string;
  customerId: string;
  siteName?: string;
  contactName?: string;
  requestedStartOn?: string;
  scopeOfWorks?: string;
  initialNotes?: string;
  projectNumberPrefix: string;
  actorId: string;
}): Promise<ProjectDetail> {
  return updateLocalStore((store) => {
    const customer = store.customers.find((item) => item.id === input.customerId);
    if (!customer) throw new Error("Customer not found");
    const number = Math.max(0, ...store.projects.map((p) => Number(p.projectNumber.match(/(\d+)$/)?.[1]) || 0)) + 1;
    let site: Site | null = null;
    if (input.siteName) {
      site = {
        id: `s-${randomUUID()}`,
        customerId: customer.id,
        name: input.siteName,
        address: "",
        suburb: "",
        state: "",
        postcode: "",
        accessNotes: input.contactName ? `Site contact: ${input.contactName}` : null,
      };
      store.sites.push(site);
      customer.siteCount += 1;
    }
    const now = new Date().toISOString();
    const project: ProjectDetail = {
      id: `p-${randomUUID()}`,
      projectNumber: `${input.projectNumberPrefix}-${new Date().getFullYear()}-${String(number).padStart(4, "0")}`,
      title: input.title,
      status: "new_request",
      heldFromStatus: null,
      customerId: customer.id,
      customerName: customer.name,
      siteId: site?.id ?? null,
      siteLabel: site?.name ?? null,
      contractValueCents: 0,
      quotedMarginPct: 0,
      projectManagerId: "u-sam",
      scheduledStartAt: null,
      scheduledEndAt: null,
      poNumber: null,
      updatedAt: now,
      openTasks: 0,
      openDefects: 0,
      assignedInstallerIds: [],
      scopeOfWorks: input.scopeOfWorks || null,
      initialNotes: input.initialNotes || null,
      depositRequiredCents: null,
      depositReceivedAt: null,
      poReceivedAt: null,
      requestedStartOn: input.requestedStartOn || null,
      installationCompletedAt: null,
      site,
      customer,
    };
    store.projects.push(project);
    addWorkflowTasks(store, project.id, project.status);
    customer.activeProjects += 1;
    addEvent(store, project.id, `Project created as ${project.projectNumber}`, input.actorId);
    addEvent(store, project.id, "Automation: project number assigned and document folder created");
    return project;
  });
}

export async function persistLocalTransition(args: {
  projectId: string;
  from: ProjectStatus;
  to: ProjectStatus;
  actorUserId: string;
  overrideReason?: string;
}) {
  return updateLocalStore((store) => {
    const project = store.projects.find((item) => item.id === args.projectId);
    if (!project) throw new Error("Project not found");
    project.status = args.to;
    project.heldFromStatus = args.to === "on_hold" ? args.from : null;
    project.updatedAt = new Date().toISOString();
    if (args.to === "installation_complete") project.installationCompletedAt = project.updatedAt;
    addWorkflowTasks(store, project.id, args.to);
    addEvent(
      store,
      project.id,
      `Status changed from ${args.from.replaceAll("_", " ")} to ${args.to.replaceAll("_", " ")}${args.overrideReason ? ` (override: ${args.overrideReason})` : ""}`,
      args.actorUserId,
    );
  });
}

export async function applyLocalAutomationEffect(effect: AutomationEffect, trigger: AutomationTrigger) {
  await updateLocalStore((store) => {
    const project = store.projects.find((item) => item.id === trigger.projectId);
    if (!project) return;
    const now = new Date();
    if (effect.type === "create_task") {
      const due = new Date(now);
      due.setDate(due.getDate() + (effect.dueInDays ?? 0));
      store.tasks.push({
        id: `task-${randomUUID()}`,
        projectId: project.id,
        title: effect.title,
        kind: effect.kind,
        status: "todo",
        assigneeId: null,
        dueOn: due.toISOString(),
        createdByAutomation: trigger.kind,
      });
      project.openTasks += 1;
      addEvent(store, project.id, `Automation: task created - ${effect.title}`);
      return;
    }
    if (effect.type === "create_inspection") {
      const inspection: Inspection = {
        id: `qa-${randomUUID()}`,
        projectId: project.id,
        result: "pending",
        inspectorId: null,
        scheduledFor: null,
        completedAt: null,
        items: [
          { id: `item-${randomUUID()}`, prompt: "Workmanship meets approved scope", isCritical: true, passed: null, comment: null },
          { id: `item-${randomUUID()}`, prompt: "Site is clean and safe", isCritical: false, passed: null, comment: null },
        ],
      };
      store.inspections.push(inspection);
      addEvent(store, project.id, "Automation: QA inspection created");
      return;
    }
    if (effect.type === "set_status" && project.status !== effect.to) {
      const from = project.status;
      project.status = effect.to;
      project.updatedAt = now.toISOString();
      addWorkflowTasks(store, project.id, effect.to);
      addEvent(store, project.id, `Automation: status moved from ${from.replaceAll("_", " ")} to ${effect.to.replaceAll("_", " ")}`);
      return;
    }
    addEvent(store, project.id, `Automation: ${effect.type.replaceAll("_", " ")}`);
  });
}
