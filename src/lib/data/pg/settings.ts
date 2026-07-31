import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema/org";
import { projects, tasks } from "@/lib/db/schema/projects";
import { schedulePhases } from "@/lib/db/schema/scheduling";
import { priceListItems } from "@/lib/db/schema/quoting";
import { sellFromMargin } from "@/lib/domain/money";
import { customers, sites } from "@/lib/db/schema/crm";
import type {
  CatalogueMaterial,
  CustomerPriceList,
  LabourSettings,
  ProductionTemplate,
  ProjectCostingOptions,
  ProjectTemplate,
  OrganisationSettings,
  QuoteDocumentTemplateSettings,
  SchedulePhaseView,
} from "../types";
import type { RolePermissionOverrides } from "@/lib/domain/permissions";
import type { StatusFieldTemplate, StatusSetting, StatusTaskTemplate } from "@/lib/domain/status-settings";
import type { ProjectStatus } from "@/lib/db/schema/enums";

/**
 * Organisation configuration, stored in `organizations.settings`.
 *
 * These are administered settings rather than transactional records: labour
 * rates, price lists, checklist templates, the quote letterhead layout. Giving
 * each its own table would mean a migration every time the admin screen grows a
 * field, which is exactly what that jsonb column exists to avoid — see the
 * comment on the schema.
 *
 * Reads and writes address one key at a time, so two admin screens saving
 * different settings concurrently do not overwrite each other's key. The write
 * merges server-side via `||` rather than read-modify-write in JS, which would
 * lose whichever save landed first.
 */

interface OrgSettings {
  labour?: LabourSettings;
  quoteTemplate?: QuoteDocumentTemplateSettings;
  priceLists?: CustomerPriceList[];
  productionTemplates?: ProductionTemplate[];
  projectTemplates?: ProjectTemplate[];
  rolePermissions?: RolePermissionOverrides;
  logoUrl?: string | null;
}

async function readSettings(orgId: string): Promise<OrgSettings> {
  const [row] = await db()
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return (row?.settings ?? {}) as OrgSettings;
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

export async function getQuoteDocumentTemplateSettings(orgId: string): Promise<QuoteDocumentTemplateSettings | null> {
  return (await readSettings(orgId)).quoteTemplate ?? null;
}

export async function saveQuoteDocumentTemplateSettings(
  orgId: string,
  value: QuoteDocumentTemplateSettings,
): Promise<void> {
  await writeSetting(orgId, "quoteTemplate", value);
}

export async function listCustomerPriceLists(orgId: string): Promise<CustomerPriceList[]> {
  return (await readSettings(orgId)).priceLists ?? [];
}

export async function listProductionTemplates(orgId: string): Promise<ProductionTemplate[]> {
  return (await readSettings(orgId)).productionTemplates ?? [];
}

export async function listProjectTemplates(orgId: string): Promise<ProjectTemplate[]> {
  return (await readSettings(orgId)).projectTemplates ?? [];
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
  const [row] = await db()
    .select({ customFields: projects.customFields })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
    .limit(1);
  const fields = (row?.customFields ?? {}) as { costing?: ProjectCostingOptions };
  return fields.costing ?? DEFAULT_COSTING;
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
  const [row] = await db()
    .select({ customFields: projects.customFields })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
    .limit(1);
  const fields = (row?.customFields ?? {}) as {
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

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    variation: row.variation,
    sku: row.code,
    description: row.description,
    costCentsPerM2: row.unitCostCents,
    standardPriceCentsPerM2: sellFromMargin(row.unitCostCents, Number(row.defaultMarginPct)),
  }));
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
export async function saveOrganisation(orgId: string, value: OrganisationSettings): Promise<void> {
  await db()
    .update(organizations)
    .set({
      name: value.name,
      slug: value.slug,
      currency: value.currency,
      timezone: value.timezone,
      projectNumberPrefix: value.projectNumberPrefix,
      settings: sql`${organizations.settings} || ${JSON.stringify({ logoUrl: value.logoUrl })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
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
