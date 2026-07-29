import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as seed from "./demo-data";
import type {
  Customer,
  CatalogueMaterial,
  CustomerPriceList,
  ProductionTemplate,
  ProjectTemplate,
  SchedulePhase,
  LeaveEntry,
  Person,
  Defect,
  DocumentRecord,
  Inspection,
  OrganisationSettings,
  ProjectDetail,
  ProjectEvent,
  Site,
  Task,
} from "./types";
import type { AutomationEffect, AutomationTrigger } from "@/lib/domain/automation";
import type { RolePermissionOverrides } from "@/lib/domain/permissions";
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
  productionTemplates: ProductionTemplate[];
  projectTemplates: ProjectTemplate[];
  organisation: OrganisationSettings;
  rolePermissions: RolePermissionOverrides;
  archivedProjects: ProjectDetail[];
  archivedCustomers: Customer[];
  schedulePhases: SchedulePhase[];
};

const storePath = join(process.cwd(), ".wombo-data", "test-data.json");
const DEFAULT_ORGANISATION: OrganisationSettings = { name: "Northline Interiors", slug: "northline", currency: "AUD", timezone: "Australia/Sydney", projectNumberPrefix: "NLI", logoUrl: null };
const LEGACY_ROLE_MAP: Record<string, Person["role"]> = { project_manager: "manager", scheduler: "manager", estimator: "manager", installer: "staff", qa_inspector: "staff", viewer: "staff" };

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
    workflowFieldValues: seed.workflowFieldValues,
    catalogueMaterials: [],
    customerPriceLists: [],
    productionTemplates: [],
    projectTemplates: [],
    organisation: DEFAULT_ORGANISATION,
    rolePermissions: {},
    archivedProjects: [],
    archivedCustomers: [],
    schedulePhases: seed.schedulePhases,
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
    const catalogueMaterials = (store.catalogueMaterials ?? []).map((material) => ({ ...material, variation: material.variation ?? null, standardPriceCentsPerM2: material.standardPriceCentsPerM2 ?? Math.round(material.costCentsPerM2 * 1.4) }));
    const productionTemplates = (store.productionTemplates ?? []).map((template) => ({
      ...template,
      materials: (template.materials ?? []).map((item) => ({
        ...item,
        mainMaterialName: item.mainMaterialName ?? catalogueMaterials.find((material) => material.id === item.materialId)?.name ?? "",
        allowVariationChoice: item.allowVariationChoice ?? false,
      })),
    }));
    const statusFieldTemplates = (store.statusFieldTemplates ?? structuredClone(DEFAULT_STATUS_FIELD_TEMPLATES)).map((template) => ({ ...template, required: template.required ?? false }));
    const people = (store.people ?? structuredClone(seed.people)).map((person) => ({ ...person, role: LEGACY_ROLE_MAP[person.role] ?? person.role }));
    const organisation = { ...DEFAULT_ORGANISATION, ...(store.organisation ?? {}) };
    return { ...freshStore(), ...store, people, organisation, rolePermissions: store.rolePermissions ?? {}, quotes: (store.quotes ?? []).filter((quote) => quote.id.startsWith("quote-")), statusSettings, statusTaskTemplates: store.statusTaskTemplates ?? structuredClone(DEFAULT_STATUS_TASK_TEMPLATES), statusFieldTemplates, workflowFieldValues: store.workflowFieldValues ?? structuredClone(seed.workflowFieldValues), catalogueMaterials, customerPriceLists: store.customerPriceLists ?? [], productionTemplates, projectTemplates: store.projectTemplates ?? [], archivedProjects: store.archivedProjects ?? [], archivedCustomers: store.archivedCustomers ?? [], schedulePhases: store.schedulePhases ?? structuredClone(seed.schedulePhases) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return freshStore();
    throw error;
  }
}

export async function readOrganisationSettings() { return (await readLocalStore()).organisation; }
export async function saveOrganisationSettings(settings: OrganisationSettings) { await updateLocalStore((store) => { store.organisation = settings; }); }
export async function readRolePermissions() { return (await readLocalStore()).rolePermissions; }
export async function saveRolePermissions(permissions: RolePermissionOverrides) { await updateLocalStore((store) => { store.rolePermissions = permissions; }); }

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

/**
 * Field capture. These are the writes the crew makes from a phone, so each one
 * is small, self-contained and appends a project event — the office sees what
 * happened on site without anyone having to phone it in.
 */

export async function startLocalTimeEntry(input: { projectId: string; userId: string; notes?: string }) {
  return updateLocalStore((store) => {
    const open = store.timeEntries.find((entry) => entry.userId === input.userId && entry.endedAt === null);
    // One clock at a time. Whatever the crew tapped last is the job they are on.
    if (open) return open;
    const person = store.people.find((item) => item.id === input.userId);
    const entry = {
      id: `te-${randomUUID()}`,
      projectId: input.projectId,
      userId: input.userId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      breakMinutes: 0,
      pausedAt: null,
      costRateCentsPerHour: person?.costRateCentsPerHour ?? 0,
      notes: input.notes?.trim() || null,
    };
    store.timeEntries.push(entry);
    addEvent(store, input.projectId, `${person?.name ?? "Crew"} clocked on site`, input.userId);
    return entry;
  });
}

export async function endLocalTimeEntry(input: { entryId: string; userId: string; breakMinutes: number }) {
  return updateLocalStore((store) => {
    const entry = store.timeEntries.find((item) => item.id === input.entryId && item.userId === input.userId);
    if (!entry || entry.endedAt) return null;
    const now = new Date();
    entry.endedAt = now.toISOString();
    const pausedMinutes = entry.pausedAt ? Math.max(0, Math.round((now.getTime() - new Date(entry.pausedAt).getTime()) / 60_000)) : 0;
    entry.pausedAt = null;
    entry.breakMinutes += input.breakMinutes + pausedMinutes;
    const person = store.people.find((item) => item.id === input.userId);
    addEvent(store, entry.projectId, `${person?.name ?? "Crew"} clocked off site`, input.userId);
    return entry;
  });
}

export async function toggleLocalTimeEntryPause(input: { entryId: string; userId: string }) {
  return updateLocalStore((store) => {
    const entry = store.timeEntries.find((item) => item.id === input.entryId && item.userId === input.userId);
    if (!entry || entry.endedAt) return null;
    const person = store.people.find((item) => item.id === input.userId);
    if (entry.pausedAt) {
      entry.breakMinutes += Math.max(0, Math.round((Date.now() - new Date(entry.pausedAt).getTime()) / 60_000));
      entry.pausedAt = null;
      addEvent(store, entry.projectId, `${person?.name ?? "Crew"} resumed their shift`, input.userId);
    } else {
      entry.pausedAt = new Date().toISOString();
      addEvent(store, entry.projectId, `${person?.name ?? "Crew"} paused their shift`, input.userId);
    }
    return entry;
  });
}

export async function updateLocalTimeEntry(input: { entryId: string; userId: string; startedAt: string; endedAt: string; breakMinutes: number }) {
  return updateLocalStore((store) => {
    const entry = store.timeEntries.find((item) => item.id === input.entryId && item.userId === input.userId);
    if (!entry || !entry.endedAt) return null;
    entry.startedAt = input.startedAt;
    entry.endedAt = input.endedAt;
    entry.breakMinutes = input.breakMinutes;
    entry.pausedAt = null;
    const person = store.people.find((item) => item.id === input.userId);
    addEvent(store, entry.projectId, `${person?.name ?? "Crew"} edited a time entry`, input.userId);
    return entry;
  });
}

export async function addLocalMaterialUse(input: {
  projectId: string;
  description: string;
  quantity: number;
  unit: string;
  userId: string;
}) {
  return updateLocalStore((store) => {
    // Unit cost comes from the catalogue when the crew picks a known line, so
    // nobody on site is ever asked to type a price.
    const catalogue = store.catalogueMaterials.find(
      (item) => item.name.toLowerCase() === input.description.trim().toLowerCase(),
    );
    const use = {
      id: `m-${randomUUID()}`,
      projectId: input.projectId,
      description: input.description.trim(),
      quantity: input.quantity,
      unit: input.unit,
      unitCostCents: catalogue?.costCentsPerM2 ?? 0,
      recordedById: input.userId,
      recordedAt: new Date().toISOString(),
    };
    store.materials.push(use);
    addEvent(store, input.projectId, `Materials used: ${input.quantity} ${input.unit} ${use.description}`, input.userId);
    return use;
  });
}

export async function addLocalVariation(input: { projectId: string; title: string; userId: string }) {
  return updateLocalStore((store) => {
    const project = store.projects.find((item) => item.id === input.projectId);
    const suffix = project?.projectNumber.split("-").pop() ?? "0000";
    const sequence = store.variations.filter((item) => item.projectId === input.projectId).length + 1;
    const variation = {
      id: `v-${randomUUID()}`,
      projectId: input.projectId,
      reference: `VO-${suffix}-${String(sequence).padStart(2, "0")}`,
      title: input.title.trim(),
      // Raised from site as a flag only: the office prices it before it is sent.
      status: "draft",
      estimatedCostCents: 0,
      quotedSellCents: 0,
    };
    store.variations.push(variation);
    addEvent(store, input.projectId, `Variation raised on site: ${variation.reference} — ${variation.title}`, input.userId);
    return variation;
  });
}

export async function addLocalSiteNote(input: { projectId: string; note: string; userId: string }) {
  return updateLocalStore((store) => {
    const person = store.people.find((item) => item.id === input.userId);
    addEvent(store, input.projectId, `Site note from ${person?.name ?? "crew"}: ${input.note.trim()}`, input.userId);
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
  defaultProjectTemplateId?: string;
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
      defaultProjectTemplateId: input.defaultProjectTemplateId || null,
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

/** CSV imports update matching SKUs and create any new material rows in one write. */
export async function importLocalCatalogueMaterials(inputs: Array<Omit<CatalogueMaterial, "id">>) {
  return updateLocalStore((store) => {
    let created = 0;
    let updated = 0;
    for (const input of inputs) {
      const existing = store.catalogueMaterials.find((material) => material.sku.toLowerCase() === input.sku.toLowerCase());
      if (existing) {
        Object.assign(existing, input);
        updated += 1;
      } else {
        store.catalogueMaterials.push({ id: `mat-${randomUUID()}`, ...input });
        created += 1;
      }
    }
    return { created, updated };
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
  await updateLocalStore((store) => { store.catalogueMaterials = store.catalogueMaterials.filter((item) => item.id !== id); for (const list of store.customerPriceLists) list.entries = list.entries.filter((entry) => entry.materialId !== id); for (const template of store.productionTemplates) template.materials = template.materials.filter((entry) => entry.materialId !== id); });
}
export async function updateLocalPriceList(id: string, input: { name: string; entries: CustomerPriceList["entries"] }) {
  await updateLocalStore((store) => { const list = store.customerPriceLists.find((item) => item.id === id); if (!list) throw new Error("Price list not found"); Object.assign(list, input); });
}
export async function deleteLocalPriceList(id: string) {
  await updateLocalStore((store) => { store.customerPriceLists = store.customerPriceLists.filter((item) => item.id !== id); for (const customer of store.customers) if (customer.priceListId === id) customer.priceListId = null; });
}

export async function createLocalProductionTemplate(input: Omit<ProductionTemplate, "id">) {
  return updateLocalStore((store) => {
    const template = { id: `prod-${randomUUID()}`, ...input };
    store.productionTemplates.push(template);
    return template;
  });
}

export async function updateLocalProductionTemplate(id: string, input: Omit<ProductionTemplate, "id">) {
  await updateLocalStore((store) => {
    const template = store.productionTemplates.find((item) => item.id === id);
    if (!template) throw new Error("Production template not found");
    Object.assign(template, input);
  });
}

export async function deleteLocalProductionTemplate(id: string) {
  await updateLocalStore((store) => {
    store.productionTemplates = store.productionTemplates.filter((item) => item.id !== id);
  });
}

export async function createLocalProjectTemplate(input: Omit<ProjectTemplate, "id">) {
  return updateLocalStore((store) => {
    const template = { id: `project-template-${randomUUID()}`, ...input };
    store.projectTemplates.push(template);
    return template;
  });
}

export async function updateLocalProjectTemplate(id: string, input: Omit<ProjectTemplate, "id">) {
  await updateLocalStore((store) => {
    const template = store.projectTemplates.find((item) => item.id === id);
    if (!template) throw new Error("Project template not found");
    Object.assign(template, input);
  });
}

export async function deleteLocalProjectTemplate(id: string) {
  await updateLocalStore((store) => {
    store.projectTemplates = store.projectTemplates.filter((item) => item.id !== id);
    for (const customer of store.customers) if (customer.defaultProjectTemplateId === id) customer.defaultProjectTemplateId = null;
  });
}

export async function setLocalCustomerDefaultProjectTemplate(customerId: string, templateId: string | null) {
  await updateLocalStore((store) => {
    const customer = store.customers.find((item) => item.id === customerId);
    if (!customer) throw new Error("Customer not found");
    customer.defaultProjectTemplateId = templateId;
  });
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
      return { id: `ql-${randomUUID()}`, catalogueMaterialId: material.id, kind: "material" as const, description: material.variation ? `${material.name} — ${material.variation}` : material.name, quantity, unit: "m²", unitCostCents: material.costCentsPerM2, costCurrency: "AUD", fxRate: 1, marginPct: 28, unitSellCentsOverride: sell };
    });
    const subtotalSellCents = lines.reduce((sum, line) => sum + line.quantity * (line.unitSellCentsOverride ?? 0), 0);
    const subtotalCostCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
    const quote = { id: `quote-${randomUUID()}`, projectId: project.id, reference: `${project.projectNumber}-Q${version}`, version, status: "draft" as const, totalCents: Math.round(subtotalSellCents * 1.1), subtotalSellCents, subtotalCostCents, marginPct: subtotalSellCents ? ((subtotalSellCents - subtotalCostCents) / subtotalSellCents) * 100 : 0, taxRatePct: 10, validUntil: null, sentAt: null, preparedById: "u-sam", lines };
    store.quotes.push(quote);
    addEvent(store, project.id, `Quote ${quote.reference} created from the materials catalogue`);
    return quote;
  });
}

export async function updateLocalMaterialQuote(args: { quoteId: string; materialIds: Array<{ materialId: string; quantity: number }> }) {
  return updateLocalStore((store) => {
    const quote = store.quotes.find((item) => item.id === args.quoteId);
    if (!quote) return null;
    const project = store.projects.find((item) => item.id === quote.projectId);
    if (!project) return null;
    const priceList = project.customer.priceListId ? store.customerPriceLists.find((list) => list.id === project.customer.priceListId) : null;
    const lines = args.materialIds.map(({ materialId, quantity }) => {
      const material = store.catalogueMaterials.find((item) => item.id === materialId);
      if (!material) throw new Error("Material not found");
      const sell = priceList?.entries.find((entry) => entry.materialId === material.id)?.priceCentsPerM2 ?? material.standardPriceCentsPerM2;
      return { id: `ql-${randomUUID()}`, catalogueMaterialId: material.id, kind: "material" as const, description: material.variation ? `${material.name} — ${material.variation}` : material.name, quantity, unit: "m²", unitCostCents: material.costCentsPerM2, costCurrency: "AUD", fxRate: 1, marginPct: 28, unitSellCentsOverride: sell };
    });
    const subtotalSellCents = lines.reduce((sum, line) => sum + line.quantity * (line.unitSellCentsOverride ?? 0), 0);
    const subtotalCostCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
    quote.lines = lines;
    quote.subtotalSellCents = subtotalSellCents;
    quote.subtotalCostCents = subtotalCostCents;
    quote.totalCents = Math.round(subtotalSellCents * (1 + quote.taxRatePct / 100));
    quote.marginPct = subtotalSellCents ? ((subtotalSellCents - subtotalCostCents) / subtotalSellCents) * 100 : 0;
    addEvent(store, project.id, `Quote ${quote.reference} updated`);
    return quote;
  });
}

export async function deleteLocalMaterialQuote(quoteId: string) {
  return updateLocalStore((store) => {
    const quote = store.quotes.find((item) => item.id === quoteId);
    if (!quote) return null;
    store.quotes = store.quotes.filter((item) => item.id !== quoteId);
    addEvent(store, quote.projectId, `Quote ${quote.reference} deleted`);
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
  poNumber?: string;
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
      poNumber: input.poNumber || null,
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
    if (input.poNumber) {
      for (const field of store.statusFieldTemplates.filter((item) => item.status === "approved")) {
        store.workflowFieldValues.push({ projectId: project.id, templateId: field.id, value: input.poNumber, updatedAt: now });
      }
    }
    addWorkflowTasks(store, project.id, project.status);
    customer.activeProjects += 1;
    addEvent(store, project.id, `Project created as ${project.projectNumber}`, input.actorId);
    addEvent(store, project.id, "Automation: project number assigned and document folder created");
    return project;
  });
}

export async function updateLocalProject(input: {
  id: string;
  projectNumber: string;
  title: string;
  customerId: string;
  siteName?: string;
  contactName?: string;
  requestedStartOn?: string;
  scopeOfWorks?: string;
  initialNotes?: string;
  poNumber?: string;
}) {
  await updateLocalStore((store) => {
    const project = store.projects.find((item) => item.id === input.id) ?? store.archivedProjects.find((item) => item.id === input.id);
    if (!project) throw new Error("Project not found");
    const projectIsActive = store.projects.some((item) => item.id === project.id);
    if ([...store.projects, ...store.archivedProjects].some((item) => item.id !== project.id && item.projectNumber.toLowerCase() === input.projectNumber.trim().toLowerCase())) throw new Error("Project ID already exists");
    const customer = store.customers.find((item) => item.id === input.customerId) ?? store.archivedCustomers.find((item) => item.id === input.customerId);
    if (!customer) throw new Error("Customer not found");
    if (project.customerId !== customer.id && projectIsActive) {
      const previous = store.customers.find((item) => item.id === project.customerId);
      if (previous) previous.activeProjects = Math.max(0, previous.activeProjects - 1);
      const next = store.customers.find((item) => item.id === customer.id);
      if (next) next.activeProjects += 1;
    }
    project.projectNumber = input.projectNumber.trim();
    project.title = input.title.trim();
    project.customerId = customer.id;
    project.customerName = customer.name;
    project.customer = customer;
    project.scopeOfWorks = input.scopeOfWorks?.trim() || null;
    project.initialNotes = input.initialNotes?.trim() || null;
    project.requestedStartOn = input.requestedStartOn || null;
    project.poNumber = input.poNumber?.trim() || null;
    project.poReceivedAt = input.poNumber?.trim() ? project.poReceivedAt ?? new Date().toISOString() : null;
    project.updatedAt = new Date().toISOString();
    const siteName = input.siteName?.trim() || "";
    if (siteName && project.site) {
      project.site.name = siteName;
      project.site.accessNotes = input.contactName?.trim() ? `Site contact: ${input.contactName.trim()}` : null;
      const site = store.sites.find((item) => item.id === project.site?.id);
      if (site) Object.assign(site, project.site, { customerId: customer.id });
      project.siteLabel = siteName;
    } else if (siteName) {
      const site: Site = { id: `s-${randomUUID()}`, customerId: customer.id, name: siteName, address: "", suburb: "", state: "", postcode: "", accessNotes: input.contactName?.trim() ? `Site contact: ${input.contactName.trim()}` : null };
      store.sites.push(site);
      project.site = site;
      project.siteId = site.id;
      project.siteLabel = site.name;
      customer.siteCount += 1;
    } else if (project.site) {
      store.sites = store.sites.filter((item) => item.id !== project.site?.id);
      const projectCustomer = store.customers.find((item) => item.id === project.customerId);
      if (projectCustomer) projectCustomer.siteCount = Math.max(0, projectCustomer.siteCount - 1);
      project.site = null;
      project.siteId = null;
      project.siteLabel = null;
    }
    for (const field of store.statusFieldTemplates.filter((item) => item.status === "approved")) {
      const existing = store.workflowFieldValues.find((value) => value.projectId === project.id && value.templateId === field.id);
      if (input.poNumber?.trim()) {
        if (existing) { existing.value = input.poNumber.trim(); existing.updatedAt = project.updatedAt; }
        else store.workflowFieldValues.push({ projectId: project.id, templateId: field.id, value: input.poNumber.trim(), updatedAt: project.updatedAt });
      } else if (existing) {
        store.workflowFieldValues = store.workflowFieldValues.filter((value) => value !== existing);
      }
    }
  });
}

export async function archiveLocalProject(id: string) {
  await updateLocalStore((store) => {
    const index = store.projects.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Project not found");
    const [project] = store.projects.splice(index, 1);
    project.updatedAt = new Date().toISOString();
    store.archivedProjects.push(project);
    const customer = store.customers.find((item) => item.id === project.customerId);
    if (customer) customer.activeProjects = Math.max(0, customer.activeProjects - 1);
  });
}

export async function restoreLocalProject(id: string) {
  await updateLocalStore((store) => {
    const index = store.archivedProjects.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Archived project not found");
    const [project] = store.archivedProjects.splice(index, 1);
    project.updatedAt = new Date().toISOString();
    store.projects.push(project);
    const customer = store.customers.find((item) => item.id === project.customerId);
    if (customer) customer.activeProjects += 1;
  });
}

export async function deleteLocalProject(id: string) {
  await updateLocalStore((store) => {
    const project = store.projects.find((item) => item.id === id) ?? store.archivedProjects.find((item) => item.id === id);
    if (!project) throw new Error("Project not found");
    const wasActive = store.projects.some((item) => item.id === id);
    store.projects = store.projects.filter((item) => item.id !== id);
    store.archivedProjects = store.archivedProjects.filter((item) => item.id !== id);
    store.tasks = store.tasks.filter((item) => item.projectId !== id);
    store.assignments = store.assignments.filter((item) => item.projectId !== id);
    store.materials = store.materials.filter((item) => item.projectId !== id);
    store.variations = store.variations.filter((item) => item.projectId !== id);
    store.documents = store.documents.filter((item) => item.projectId !== id);
    store.inspections = store.inspections.filter((item) => item.projectId !== id);
    store.defects = store.defects.filter((item) => item.projectId !== id);
    store.events = store.events.filter((item) => item.projectId !== id);
    store.quotes = store.quotes.filter((item) => item.projectId !== id);
    store.workflowFieldValues = store.workflowFieldValues.filter((item) => item.projectId !== id);
    store.schedulePhases = store.schedulePhases.filter((item) => item.projectId !== id);
    if (wasActive) {
      const customer = store.customers.find((item) => item.id === project.customerId);
      if (customer) customer.activeProjects = Math.max(0, customer.activeProjects - 1);
    }
  });
}

export async function updateLocalCustomer(input: {
  id: string;
  name: string;
  accountType?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  paymentTermsDays: number;
  priceListId?: string;
  defaultProjectTemplateId?: string;
}) {
  await updateLocalStore((store) => {
    const customer = store.customers.find((item) => item.id === input.id) ?? store.archivedCustomers.find((item) => item.id === input.id);
    if (!customer) throw new Error("Customer not found");
    Object.assign(customer, { name: input.name.trim(), accountType: input.accountType?.trim() || null, primaryContactName: input.contactName?.trim() || null, primaryContactEmail: input.contactEmail?.trim() || null, primaryContactPhone: input.contactPhone?.trim() || null, paymentTermsDays: input.paymentTermsDays, priceListId: input.priceListId || null, defaultProjectTemplateId: input.defaultProjectTemplateId || null });
    for (const project of [...store.projects, ...store.archivedProjects].filter((item) => item.customerId === customer.id)) {
      project.customerName = customer.name;
      project.customer = customer;
      project.updatedAt = new Date().toISOString();
    }
  });
}

export async function archiveLocalCustomer(id: string) {
  await updateLocalStore((store) => {
    const index = store.customers.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Customer not found");
    const [customer] = store.customers.splice(index, 1);
    store.archivedCustomers.push(customer);
  });
}

export async function restoreLocalCustomer(id: string) {
  await updateLocalStore((store) => {
    const index = store.archivedCustomers.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Archived customer not found");
    const [customer] = store.archivedCustomers.splice(index, 1);
    store.customers.push(customer);
  });
}

export async function deleteLocalCustomer(id: string) {
  await updateLocalStore((store) => {
    if (!store.customers.some((item) => item.id === id) && !store.archivedCustomers.some((item) => item.id === id)) throw new Error("Customer not found");
    store.customers = store.customers.filter((item) => item.id !== id);
    store.archivedCustomers = store.archivedCustomers.filter((item) => item.id !== id);
    store.sites = store.sites.filter((item) => item.customerId !== id);
  });
}

export async function createLocalSchedulePhase(input: Omit<SchedulePhase, "id">) {
  return updateLocalStore((store) => {
    if (!store.projects.some((project) => project.id === input.projectId)) throw new Error("Project not found");
    if (!store.people.some((person) => person.id === input.userId)) throw new Error("User not found");
    assertUserAvailable(store, input.userId, input.date);
    const phase = { id: `phase-${randomUUID()}`, ...input };
    store.schedulePhases.push(phase);
    return phase;
  });
}

export async function updateLocalSchedulePhase(id: string, input: Omit<SchedulePhase, "id" | "projectId">) {
  await updateLocalStore((store) => {
    const phase = store.schedulePhases.find((item) => item.id === id);
    if (!phase) throw new Error("Phase not found");
    if (!store.people.some((person) => person.id === input.userId)) throw new Error("User not found");
    assertUserAvailable(store, input.userId, input.date);
    Object.assign(phase, input);
  });
}

function assertUserAvailable(store: LocalStore, userId: string, date: string) {
  const unavailable = store.leave.find((entry) => entry.userId === userId && entry.status !== "cancelled" && entry.status !== "declined" && date >= availabilityDate(entry.startsAt) && date <= availabilityDate(entry.endsAt));
  if (unavailable) throw new Error(`This person is unavailable on that date (${unavailable.type.replaceAll("_", " ")}).`);
}

function availabilityDate(value: string) { if (value.length === 10) return value; const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export async function deleteLocalSchedulePhase(id: string) {
  await updateLocalStore((store) => { store.schedulePhases = store.schedulePhases.filter((item) => item.id !== id); });
}

/** Schedule (or reschedule) the QA inspection and mirror it to the calendar. */
export async function scheduleLocalInspection(input: { inspectionId?: string | null; projectId: string; inspectorId: string; date: string }) {
  return updateLocalStore((store) => {
    let inspection = input.inspectionId ? store.inspections.find((item) => item.id === input.inspectionId && item.projectId === input.projectId) : null;
    if (!inspection) {
      inspection = { id: `qa-${randomUUID()}`, projectId: input.projectId, result: "pending", inspectorId: null, scheduledFor: null, completedAt: null, items: [
        { id: `item-${randomUUID()}`, prompt: "Workmanship meets approved scope", isCritical: true, passed: null, comment: null },
        { id: `item-${randomUUID()}`, prompt: "Site is clean and safe", isCritical: false, passed: null, comment: null },
      ] };
      store.inspections.push(inspection);
    }
    const inspector = store.people.find((person) => person.id === input.inspectorId);
    if (!inspector) throw new Error("User not found");
    assertUserAvailable(store, input.inspectorId, input.date);
    inspection.inspectorId = input.inspectorId;
    inspection.scheduledFor = input.date;
    const existing = store.schedulePhases.find((phase) => phase.inspectionId === inspection.id);
    if (existing) Object.assign(existing, { userId: input.inspectorId, date: input.date, title: "QA inspection", description: "Scheduled QA inspection", inspectionId: inspection.id });
    else store.schedulePhases.push({ id: `phase-${randomUUID()}`, projectId: input.projectId, title: "QA inspection", description: "Scheduled QA inspection", userId: input.inspectorId, date: input.date, inspectionId: inspection.id });
    addEvent(store, input.projectId, `QA inspection scheduled for ${input.date} with ${inspector.name}`, input.inspectorId);
    return inspection;
  });
}

function initialsFor(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?"; }

export async function createLocalPerson(input: Omit<Person, "id" | "initials">) {
  return updateLocalStore((store) => {
    const person = { id: `u-${randomUUID()}`, initials: initialsFor(input.name), ...input };
    store.people.push(person);
    return person;
  });
}

export async function updateLocalPerson(id: string, input: Omit<Person, "id" | "initials">) {
  await updateLocalStore((store) => {
    const person = store.people.find((item) => item.id === id);
    if (!person) throw new Error("Person not found");
    Object.assign(person, input, { initials: initialsFor(input.name) });
  });
}

export async function deleteLocalPerson(id: string) {
  await updateLocalStore((store) => {
    store.people = store.people.filter((item) => item.id !== id);
    store.leave = store.leave.filter((item) => item.userId !== id);
    store.assignments = store.assignments.filter((item) => item.userId !== id);
    store.timeEntries = store.timeEntries.filter((item) => item.userId !== id);
    store.schedulePhases = store.schedulePhases.filter((item) => item.userId !== id);
  });
}

export async function createLocalLeave(input: Omit<LeaveEntry, "id">) {
  return updateLocalStore((store) => {
    if (!store.people.some((person) => person.id === input.userId)) throw new Error("Person not found");
    const leave = { id: `leave-${randomUUID()}`, ...input };
    store.leave.push(leave);
    return leave;
  });
}

export async function updateLocalLeave(id: string, input: Omit<LeaveEntry, "id">) {
  await updateLocalStore((store) => {
    const leave = store.leave.find((item) => item.id === id);
    if (!leave) throw new Error("Leave record not found");
    Object.assign(leave, input);
  });
}

export async function deleteLocalLeave(id: string) {
  await updateLocalStore((store) => { store.leave = store.leave.filter((item) => item.id !== id); });
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
