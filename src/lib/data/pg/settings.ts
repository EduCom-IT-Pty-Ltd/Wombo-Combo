import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { once } from "../request-scope";
import { organizations } from "@/lib/db/schema/org";
import { projects, tasks } from "@/lib/db/schema/projects";
import { leaveRequests, schedulePhases } from "@/lib/db/schema/scheduling";
import { priceListItems } from "@/lib/db/schema/quoting";
import { marginPctOf, sellFromMargin } from "@/lib/domain/money";
import { customers, sites } from "@/lib/db/schema/crm";
import type {
  CatalogueMaterial,
  CustomerPriceList,
  LabourSettings,
  ProductionTemplate,
  ProjectCostingOptions,
  ProjectTemplate,
  OrganisationSettings,
  SchedulePhaseView,
  SwmsRecord,
  SwmsTemplate,
} from "../types";
import type { RolePermissionOverrides } from "@/lib/domain/permissions";
import type { StatusFieldTemplate, StatusSetting, StatusTaskTemplate } from "@/lib/domain/status-settings";
import type { ProjectStatus } from "@/lib/db/schema/enums";
import { normaliseSwmsTemplate, normaliseSwmsValues } from "@/lib/domain/swms";
import { EMPTY_MATERIAL_CATALOGUE_PRESENTATION, normaliseMaterialCataloguePresentation } from "@/lib/domain/material-catalogue";
import type { MaterialCataloguePresentation } from "@/lib/domain/material-catalogue";
import type { OrganisationLogoLocation } from "@/lib/integrations/sharepoint/branding";

/**
 * Organisation configuration, stored in `organizations.settings`.
 *
 * These are administered settings rather than transactional records: labour
 * rates, price lists, checklist templates, role overrides. Giving each its own
 * table would mean a migration every time the admin screen grows a field, which
 * is exactly what that jsonb column exists to avoid — see the comment on the
 * schema.
 *
 * Reads and writes address one key at a time, so two admin screens saving
 * different settings concurrently do not overwrite each other's key. The write
 * merges server-side via `||` rather than read-modify-write in JS, which would
 * lose whichever save landed first.
 */

interface OrgSettings {
  labour?: LabourSettings;
  priceLists?: CustomerPriceList[];
  productionTemplates?: ProductionTemplate[];
  projectTemplates?: ProjectTemplate[];
  rolePermissions?: RolePermissionOverrides;
  logoUrl?: string | null;
  logoSharePoint?: OrganisationLogoLocation;
  swmsTemplate?: SwmsTemplate;
  materialCataloguePresentation?: MaterialCataloguePresentation;
}

/**
 * All of it lives in one jsonb column, so all of it arrives in one read. Nine
 * getters hang off this — labour, price lists, templates, permissions, the
 * status flow — and every one of them used to fetch the same row again.
 */
async function readSettings(orgId: string): Promise<OrgSettings> {
  return once(`orgSettings:${orgId}`, async () => {
    const [row] = await db()
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return (row?.settings ?? {}) as OrgSettings;
  });
}

/**
 * `projects.custom_fields` holds both the costing options and the workflow
 * field values. They are asked for separately and read together.
 */
async function readProjectCustomFields(orgId: string, projectId: string): Promise<Record<string, unknown>> {
  return once(`projectCustomFields:${orgId}:${projectId}`, async () => {
    const [row] = await db()
      .select({ customFields: projects.customFields })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
      .limit(1);
    return (row?.customFields ?? {}) as Record<string, unknown>;
  });
}

/** Merges one key into the settings object without reading it back first. */
async function writeSetting<K extends keyof OrgSettings>(
  orgId: string,
  key: K,
  value: OrgSettings[K],
): Promise<void> {
  await db()
    .update(organizations)
    .set({
      settings: sql`${organizations.settings} || ${JSON.stringify({ [key]: value })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

const DEFAULT_LABOUR: LabourSettings = {
  standardLabourEnabled: false,
  standardLabourCostCentsPerEmployee: 0,
  subcontractorMaterialRates: [],
};

export async function getLabourSettings(orgId: string): Promise<LabourSettings> {
  return (await readSettings(orgId)).labour ?? DEFAULT_LABOUR;
}

export async function saveLabourSettings(orgId: string, value: LabourSettings): Promise<void> {
  await writeSetting(orgId, "labour", value);
}

export async function listCustomerPriceLists(orgId: string): Promise<CustomerPriceList[]> {
  return (await readSettings(orgId)).priceLists ?? [];
}

export async function listProductionTemplates(orgId: string): Promise<ProductionTemplate[]> {
  return (await readSettings(orgId)).productionTemplates ?? [];
}

/** UI-only grouping and visibility for the Xero-owned catalogue. */
export async function getMaterialCataloguePresentation(orgId: string): Promise<MaterialCataloguePresentation> {
  return normaliseMaterialCataloguePresentation((await readSettings(orgId)).materialCataloguePresentation ?? EMPTY_MATERIAL_CATALOGUE_PRESENTATION);
}

export async function saveMaterialCataloguePresentation(orgId: string, value: MaterialCataloguePresentation): Promise<void> {
  await writeSetting(orgId, "materialCataloguePresentation", normaliseMaterialCataloguePresentation(value));
}

export async function listProjectTemplates(orgId: string): Promise<ProjectTemplate[]> {
  return (await readSettings(orgId)).projectTemplates ?? [];
}

/** The organisation-wide SWMS layout. It is JSON configuration by design. */
export async function getSwmsTemplate(orgId: string): Promise<SwmsTemplate> {
  return normaliseSwmsTemplate((await readSettings(orgId)).swmsTemplate);
}

export async function saveSwmsTemplate(orgId: string, value: SwmsTemplate): Promise<void> {
  await writeSetting(orgId, "swmsTemplate", normaliseSwmsTemplate(value));
}

export async function getRolePermissions(orgId: string): Promise<RolePermissionOverrides> {
  return (await readSettings(orgId)).rolePermissions ?? {};
}

export async function saveRolePermissions(orgId: string, value: RolePermissionOverrides): Promise<void> {
  await writeSetting(orgId, "rolePermissions", value);
}

/**
 * Per-project costing choices, kept in `projects.custom_fields` — the column the
 * schema provides for per-project extension without a migration.
 */
const DEFAULT_COSTING: ProjectCostingOptions = {
  standardLabourEnabled: false,
  employeeCount: 0,
  includeSubcontractorMaterialCosts: false,
};

export async function getProjectCostingOptions(orgId: string, projectId: string): Promise<ProjectCostingOptions> {
  const fields = (await readProjectCustomFields(orgId, projectId)) as { costing?: ProjectCostingOptions };
  return fields.costing ?? DEFAULT_COSTING;
}

/**
 * Costing options for many projects at once, for the finance table. One read
 * per row turned a page of completed jobs into a query per job.
 */
export async function getProjectCostingOptionsForProjects(
  orgId: string,
  projectIds: string[],
): Promise<Map<string, ProjectCostingOptions>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db()
    .select({ id: projects.id, customFields: projects.customFields })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), inArray(projects.id, projectIds)));
  return new Map(
    rows.map((row) => [row.id, ((row.customFields ?? {}) as { costing?: ProjectCostingOptions }).costing ?? DEFAULT_COSTING]),
  );
}

export async function saveProjectCostingOptions(
  orgId: string,
  projectId: string,
  value: ProjectCostingOptions,
): Promise<void> {
  await db()
    .update(projects)
    .set({
      customFields: sql`${projects.customFields} || ${JSON.stringify({ costing: value })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)));
}

/** One saved SWMS per project, in the project's extensible JSON fields. */
export async function getProjectSwms(orgId: string, projectId: string): Promise<SwmsRecord | null> {
  const fields = (await readProjectCustomFields(orgId, projectId)) as { swms?: Partial<SwmsRecord> };
  if (!fields.swms || typeof fields.swms !== "object") return null;
  const value = fields.swms;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null;
  const template = await getSwmsTemplate(orgId);
  return {
    templateName: typeof value.templateName === "string" ? value.templateName : template.name,
    templateVersion: typeof value.templateVersion === "string" ? value.templateVersion : template.versionLabel,
    values: normaliseSwmsValues(value.values, template),
    photoDocumentIds: Array.isArray(value.photoDocumentIds) ? value.photoDocumentIds.filter((id): id is string => typeof id === "string") : [],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    createdByUserId: typeof value.createdByUserId === "string" ? value.createdByUserId : null,
    updatedByUserId: typeof value.updatedByUserId === "string" ? value.updatedByUserId : null,
  };
}

export async function saveProjectSwms(orgId: string, projectId: string, value: SwmsRecord): Promise<boolean> {
  const updated = await db()
    .update(projects)
    .set({ customFields: sql`${projects.customFields} || ${JSON.stringify({ swms: value })}::jsonb`, updatedAt: new Date() })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
    .returning({ id: projects.id });
  return updated.length > 0;
}

export async function deleteProjectSwms(orgId: string, projectId: string): Promise<boolean> {
  const updated = await db()
    .update(projects)
    .set({ customFields: sql`${projects.customFields} - 'swms'`, updatedAt: new Date() })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
    .returning({ id: projects.id });
  return updated.length > 0;
}

/** Call-Ups, joined to the project and site labels the calendar renders. */
export async function listSchedulePhases(
  orgId: string,
  opts: { projectId?: string; userId?: string } = {},
): Promise<SchedulePhaseView[]> {
  const conditions = [eq(schedulePhases.orgId, orgId)];
  if (opts.projectId) conditions.push(eq(schedulePhases.projectId, opts.projectId));
  if (opts.userId) conditions.push(eq(schedulePhases.userId, opts.userId));

  const rows = await db()
    .select({
      phase: schedulePhases,
      projectNumber: projects.projectNumber,
      projectTitle: projects.title,
      siteName: sites.name,
      siteSuburb: sites.suburb,
      siteState: sites.state,
    })
    .from(schedulePhases)
    .innerJoin(projects, eq(projects.id, schedulePhases.projectId))
    .leftJoin(sites, eq(sites.id, projects.siteId))
    .where(and(...conditions))
    .orderBy(asc(schedulePhases.date), asc(projects.title));

  return rows.map((row) => ({
    id: row.phase.id,
    projectId: row.phase.projectId,
    title: row.phase.title,
    description: row.phase.description,
    userId: row.phase.userId,
    // `date` is a date column, so the driver hands back "YYYY-MM-DD" already —
    // no timezone conversion, which is the point of not using a timestamp here.
    date: row.phase.date,
    inspectionId: row.phase.inspectionId,
    projectNumber: row.projectNumber,
    projectTitle: row.projectTitle,
    siteLabel: row.siteName
      ? [row.siteName, [row.siteSuburb, row.siteState].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
      : null,
  }));
}

/**
 * Refuse to book someone who is on leave that day.
 *
 * The same rule the JSON store enforced, and the reason it lives beside the
 * write rather than in the form: a booking made from a stale page, or by two
 * people at once, has to be caught here or not at all.
 *
 * `requested` leave counts as unavailable alongside `approved`. Someone who has
 * asked for the day off and not heard back is exactly who should not be quietly
 * booked onto a job.
 */
export async function assertUserAvailable(orgId: string, userId: string, date: string): Promise<void> {
  const day = new Date(`${date}T00:00:00.000Z`);
  const [clash] = await db()
    .select({ type: leaveRequests.type })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        eq(leaveRequests.userId, userId),
        notInArray(leaveRequests.status, ["cancelled", "declined"]),
        lte(leaveRequests.startsAt, new Date(`${date}T23:59:59.999Z`)),
        gte(leaveRequests.endsAt, day),
      ),
    )
    .limit(1);

  if (clash) throw new Error(`This person is unavailable on that date (${clash.type.replaceAll("_", " ")}).`);
}

export interface SchedulePhaseInput {
  title: string;
  description: string | null;
  userId: string;
  date: string;
}

export async function createSchedulePhase(
  orgId: string,
  input: SchedulePhaseInput & { projectId: string },
): Promise<void> {
  await assertUserAvailable(orgId, input.userId, input.date);
  await db().insert(schedulePhases).values({ orgId, ...input });
}

export async function updateSchedulePhase(orgId: string, id: string, input: SchedulePhaseInput): Promise<void> {
  await assertUserAvailable(orgId, input.userId, input.date);
  const updated = await db()
    .update(schedulePhases)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(schedulePhases.orgId, orgId), eq(schedulePhases.id, id)))
    .returning({ id: schedulePhases.id });
  if (updated.length === 0) throw new Error("Phase not found");
}

export async function deleteSchedulePhase(orgId: string, id: string): Promise<void> {
  await db().delete(schedulePhases).where(and(eq(schedulePhases.orgId, orgId), eq(schedulePhases.id, id)));
}

// --- Per-status workflow checklists -----------------------------------------

/**
 * Checklist templates are org configuration; the values people enter against
 * them are project data. The two live apart accordingly: templates in
 * `organizations.settings`, entered values in `projects.custom_fields`, and
 * completed checklist items as real rows in `tasks`.
 */
export async function getStatusTaskTemplates(orgId: string): Promise<StatusTaskTemplate[] | null> {
  const settings = (await readSettings(orgId)) as OrgSettings & { statusTaskTemplates?: StatusTaskTemplate[] };
  return settings.statusTaskTemplates ?? null;
}

export async function getStatusFieldTemplates(orgId: string): Promise<StatusFieldTemplate[] | null> {
  const settings = (await readSettings(orgId)) as OrgSettings & { statusFieldTemplates?: StatusFieldTemplate[] };
  return settings.statusFieldTemplates ?? null;
}

export async function getWorkflowFieldValues(
  orgId: string,
  projectId: string,
): Promise<Record<string, { value: string; updatedAt: string }>> {
  const fields = (await readProjectCustomFields(orgId, projectId)) as {
    workflowFields?: Record<string, { value: string; updatedAt: string }>;
  };
  return fields.workflowFields ?? {};
}

export async function saveWorkflowFieldValues(
  orgId: string,
  projectId: string,
  values: Array<{ templateId: string; value: string }>,
): Promise<void> {
  const now = new Date().toISOString();
  const merged = Object.fromEntries(values.map((v) => [v.templateId, { value: v.value, updatedAt: now }]));
  await db()
    .update(projects)
    .set({
      // Merged one level down so saving one stage's fields does not clear
      // another's, and so a concurrent save of a different key survives.
      customFields: sql`
        jsonb_set(
          ${projects.customFields},
          '{workflowFields}',
          coalesce(${projects.customFields} -> 'workflowFields', '{}'::jsonb) || ${JSON.stringify(merged)}::jsonb,
          true
        )`,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)));
}

/** Marks a checklist item done, or reopens it, without duplicating rows. */
export async function setWorkflowTaskComplete(
  orgId: string,
  input: { projectId: string; templateId: string; title: string; status: ProjectStatus; complete: boolean; completedAt?: Date },
): Promise<void> {
  const [existing] = await db()
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        eq(tasks.projectId, input.projectId),
        eq(tasks.workflowTemplateId, input.templateId),
      ),
    )
    .limit(1);

  if (existing) {
    await db()
      .update(tasks)
      .set({
        status: input.complete ? "done" : "todo",
        completedAt: input.complete ? (input.completedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, existing.id));
    return;
  }

  // Reopening something that was never completed has nothing to record.
  if (!input.complete) return;

  await db().insert(tasks).values({
    orgId,
    projectId: input.projectId,
    title: input.title,
    kind: "admin",
    status: "done",
    completedAt: input.completedAt ?? new Date(),
    workflowStatus: input.status,
    workflowTemplateId: input.templateId,
  });
}

/**
 * Tick off a set of checklist items in one go — the tick-box on the dialog that
 * skips a project past one or more stages.
 *
 * Items with no row yet are inserted already complete rather than ignored. A
 * checklist item only becomes a `tasks` row once somebody touches it, so most of
 * what is being closed here has never been written down, and updating only what
 * exists would silently do nothing on exactly the projects this is meant for.
 */
export async function completeWorkflowTasks(
  orgId: string,
  projectId: string,
  templates: Array<{ id: string; title: string; status: ProjectStatus }>,
): Promise<void> {
  if (templates.length === 0) return;
  const completedAt = new Date();

  const updated = await db()
    .update(tasks)
    .set({ status: "done", completedAt, updatedAt: completedAt })
    .where(
      and(
        eq(tasks.orgId, orgId),
        eq(tasks.projectId, projectId),
        inArray(
          tasks.workflowTemplateId,
          templates.map((template) => template.id),
        ),
      ),
    )
    .returning({ workflowTemplateId: tasks.workflowTemplateId });

  const written = new Set(updated.map((row) => row.workflowTemplateId));
  const missing = templates.filter((template) => !written.has(template.id));
  if (missing.length === 0) return;

  await db()
    .insert(tasks)
    .values(
      missing.map((template) => ({
        orgId,
        projectId,
        title: template.title,
        kind: "admin" as const,
        status: "done" as const,
        completedAt,
        workflowStatus: template.status,
        workflowTemplateId: template.id,
      })),
    );
}

export async function listWorkflowTaskRows(orgId: string, projectId: string) {
  return db()
    .select()
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.projectId, projectId), isNotNull(tasks.workflowTemplateId)));
}

/**
 * The material catalogue, from `price_list_items`.
 *
 * The catalogue stores cost and a default margin; the standard sell price is
 * derived rather than stored, via the same `sellFromMargin` the quote builder
 * uses. Storing both would let a margin change leave a stale price behind, and
 * margin here is on sell, not markup on cost.
 */
export async function listCatalogueMaterials(orgId: string): Promise<CatalogueMaterial[]> {
  const rows = await db()
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.orgId, orgId), eq(priceListItems.active, true)))
    .orderBy(asc(priceListItems.name));

  return rows.map(toCatalogueMaterial);
}

function toCatalogueMaterial(row: typeof priceListItems.$inferSelect): CatalogueMaterial {
  return {
    id: row.id,
    name: row.name,
    variation: row.variation,
    sku: row.code,
    description: row.description,
    costCentsPerM2: row.unitCostCents,
    // A stored sell price wins over a derived one. Only rows that predate the
    // column, or that were entered as "cost plus a margin", fall through.
    standardPriceCentsPerM2: row.unitSellCents ?? sellFromMargin(row.unitCostCents, Number(row.defaultMarginPct)),
    xeroItemId: row.xeroItemId,
  };
}

export type CatalogueMaterialInput = Omit<CatalogueMaterial, "id"> & {
  /** Xero's revenue account for this item. Only the item sync knows it. */
  xeroSalesAccountCode?: string | null;
};

/**
 * Catalogue rows are keyed by `code` within an org, and the code is blank on the
 * legacy parent rows that exist only to group variations. Those cannot go
 * through the unique index, so they get a generated placeholder — visible
 * nowhere, but it keeps a second unnamed parent from colliding with the first.
 * Nothing writes one any more: every Xero item carries a code.
 */
function codeFor(input: CatalogueMaterialInput): string {
  return input.sku.trim() || `internal-${randomUUID()}`;
}

/**
 * Margin is stored alongside the explicit sell price so the two never disagree:
 * the catalogue screen shows a margin derived from the same pair of numbers the
 * quote builder prices from.
 */
function marginFor(input: CatalogueMaterialInput): string {
  return String(marginPctOf(input.costCentsPerM2, input.standardPriceCentsPerM2));
}

function materialValues(orgId: string, input: CatalogueMaterialInput) {
  return {
    orgId,
    code: codeFor(input),
    name: input.name,
    variation: input.variation,
    description: input.description,
    kind: "material" as const,
    unit: "m²",
    unitCostCents: input.costCentsPerM2,
    unitSellCents: input.standardPriceCentsPerM2,
    defaultMarginPct: marginFor(input),
    xeroItemId: input.xeroItemId ?? null,
    xeroSalesAccountCode: input.xeroSalesAccountCode ?? null,
    active: true,
  };
}

/**
 * Hard delete rather than `active = false`.
 *
 * Quote lines reference the row with `on delete set null` and carry their own
 * copy of the description and price, so a deleted material cannot rewrite the
 * history of a quote that used it. Leaving soft-deleted rows behind would only
 * mean the unique index on `code` blocks re-adding the same SKU later.
 */
export async function deleteCatalogueMaterial(orgId: string, id: string): Promise<void> {
  await db().delete(priceListItems).where(and(eq(priceListItems.orgId, orgId), eq(priceListItems.id, id)));

  // Price lists live in the settings blob, so nothing cascades — the entry for a
  // material that no longer exists has to be dropped by hand or it prices a
  // ghost.
  const lists = await listCustomerPriceLists(orgId);
  if (lists.some((list) => list.entries.some((entry) => entry.materialId === id))) {
    await saveCustomerPriceLists(
      orgId,
      lists.map((list) => ({ ...list, entries: list.entries.filter((entry) => entry.materialId !== id) })),
    );
  }

  const templates = await listProductionTemplates(orgId);
  if (templates.some((template) => template.materials.some((entry) => entry.materialId === id))) {
    await saveProductionTemplates(
      orgId,
      templates.map((template) => ({
        ...template,
        materials: template.materials.filter((entry) => entry.materialId !== id),
      })),
    );
  }
}

/**
 * Bulk upsert, matching on code. The Xero item sync is the only caller, and so
 * the only thing that writes material data at all — nothing in the application
 * creates or edits a material, because a hand-kept row would drift from Xero and
 * lose the `xero_item_id` its quote lines need to carry an item code.
 *
 * One statement per row rather than a single multi-row insert: `on conflict do
 * update` cannot see the other rows in its own batch, so a pull containing the
 * same code twice would fail the whole statement rather than have the second
 * win. Catalogues are hundreds of rows, not millions, and correctness is worth
 * more here than one round trip.
 */
export async function importCatalogueMaterials(
  orgId: string,
  inputs: CatalogueMaterialInput[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const input of inputs) {
    const values = materialValues(orgId, input);
    const [row] = await db()
      .insert(priceListItems)
      .values(values)
      .onConflictDoUpdate({
        target: [priceListItems.orgId, priceListItems.code],
        set: {
          name: values.name,
          variation: values.variation,
          description: values.description,
          unitCostCents: values.unitCostCents,
          unitSellCents: values.unitSellCents,
          defaultMarginPct: values.defaultMarginPct,
          xeroItemId: values.xeroItemId,
          xeroSalesAccountCode: values.xeroSalesAccountCode,
          active: true,
          updatedAt: new Date(),
        },
      })
      // `xmax = 0` is true only for a row this statement inserted, which is the
      // one way Postgres will tell an upsert which branch it took.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });

    if (row?.inserted) created += 1;
    else updated += 1;
  }

  return { created, updated };
}

export interface XeroItemRef {
  code: string;
  salesAccountCode: string | null;
}

/**
 * How a set of catalogue materials should be billed in Xero, keyed by material id.
 *
 * Only rows carrying a `xero_item_id` are returned. A code Xero does not know
 * fails the whole invoice, so "we are not sure" has to mean "send no code" —
 * the line still bills, it just falls back to the default revenue account.
 */
export async function getXeroItemRefs(orgId: string, materialIds: string[]): Promise<Map<string, XeroItemRef>> {
  if (materialIds.length === 0) return new Map();
  const rows = await db()
    .select({
      id: priceListItems.id,
      code: priceListItems.code,
      salesAccountCode: priceListItems.xeroSalesAccountCode,
    })
    .from(priceListItems)
    .where(
      and(
        eq(priceListItems.orgId, orgId),
        inArray(priceListItems.id, materialIds),
        isNotNull(priceListItems.xeroItemId),
      ),
    );
  return new Map(rows.map((row) => [row.id, { code: row.code, salesAccountCode: row.salesAccountCode }]));
}

export async function saveCustomerPriceLists(orgId: string, value: CustomerPriceList[]): Promise<void> {
  await writeSetting(orgId, "priceLists", value);
}

export async function saveProductionTemplates(orgId: string, value: ProductionTemplate[]): Promise<void> {
  await writeSetting(orgId, "productionTemplates", value);
}

export async function saveProjectTemplates(orgId: string, value: ProjectTemplate[]): Promise<void> {
  await writeSetting(orgId, "projectTemplates", value);
}

/**
 * Clear a deleted project template off the customers that defaulted to it.
 *
 * Templates live in the settings blob, so nothing cascades. A customer pointing
 * at a template that no longer exists would silently start new projects with no
 * default at all — the same outcome, but reached by accident rather than by
 * anyone deciding it.
 */
export async function clearCustomerDefaultProjectTemplate(orgId: string, templateId: string): Promise<void> {
  await db()
    .update(customers)
    .set({ defaultProjectTemplateId: null, updatedAt: new Date() })
    .where(and(eq(customers.orgId, orgId), eq(customers.defaultProjectTemplateId, templateId)));
}

/** Revenue account code invoices are coded to. Null until an admin picks one. */
export async function getXeroAccountCode(orgId: string): Promise<string | null> {
  const settings = (await readSettings(orgId)) as OrgSettings & { xeroRevenueAccountCode?: string };
  return settings.xeroRevenueAccountCode ?? null;
}

export async function setXeroAccountCode(orgId: string, code: string): Promise<void> {
  await db()
    .update(organizations)
    .set({
      settings: sql`${organizations.settings} || ${JSON.stringify({ xeroRevenueAccountCode: code })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

// --- Writes that previously only existed against the JSON store --------------

/**
 * Organisation profile. `logoUrl` is not a column — it lives in `settings`
 * alongside the other presentation-only values.
 */
export async function saveOrganisation(
  orgId: string,
  value: OrganisationSettings,
  logoSharePoint?: OrganisationLogoLocation,
): Promise<void> {
  const logoSettings = {
    logoUrl: value.logoUrl,
    ...(logoSharePoint ? { logoSharePoint } : {}),
  };
  await db()
    .update(organizations)
    .set({
      name: value.name,
      slug: value.slug,
      currency: value.currency,
      timezone: value.timezone,
      projectNumberPrefix: value.projectNumberPrefix,
      settings: sql`${organizations.settings} || ${JSON.stringify(logoSettings)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

/** The stable SharePoint identifiers behind the public in-app logo route. */
export async function getOrganisationLogoLocation(orgId: string): Promise<OrganisationLogoLocation | null> {
  const value = (await readSettings(orgId)).logoSharePoint;
  if (!value || typeof value.driveId !== "string" || typeof value.itemId !== "string") return null;
  return value;
}

export async function getStatusSettings(orgId: string): Promise<StatusSetting[] | null> {
  const s = (await readSettings(orgId)) as OrgSettings & { statusSettings?: StatusSetting[] };
  return s.statusSettings ?? null;
}

export async function saveStatusSettings(orgId: string, value: StatusSetting[]): Promise<void> {
  await db()
    .update(organizations)
    .set({
      settings: sql`${organizations.settings} || ${JSON.stringify({ statusSettings: value })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export async function saveStatusTaskTemplates(orgId: string, value: StatusTaskTemplate[]): Promise<void> {
  await db()
    .update(organizations)
    .set({
      settings: sql`${organizations.settings} || ${JSON.stringify({ statusTaskTemplates: value })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export async function saveStatusFieldTemplates(orgId: string, value: StatusFieldTemplate[]): Promise<void> {
  await db()
    .update(organizations)
    .set({
      settings: sql`${organizations.settings} || ${JSON.stringify({ statusFieldTemplates: value })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export async function setCustomerDefaultProjectTemplate(
  orgId: string,
  customerId: string,
  templateId: string | null,
): Promise<void> {
  await db()
    .update(customers)
    .set({ defaultProjectTemplateId: templateId, updatedAt: new Date() })
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
}
