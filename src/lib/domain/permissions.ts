import type { Role } from "@/lib/db/schema/enums";

export type { Role };

/**
 * Capability-based RBAC. Screens and server actions both check capabilities,
 * never roles directly — so adding a role is a one-line change here rather than
 * a grep across the app.
 *
 * WorkOS carries the role on the organization membership; `src/lib/auth` maps
 * it onto this list.
 */
export const CAPABILITIES = [
  "project.view",
  "project.create",
  "project.edit",
  "project.transition",
  "project.transition.override", // bypass a soft guard with a recorded reason
  "customer.view",
  "customer.manage",
  "quote.view",
  "quote.edit",
  "quote.approve", // internal sign-off before issuing
  "quote.send",
  "schedule.view",
  "schedule.manage",
  "field.clock", // clock on/off against a job
  "field.record", // materials, notes, photos, variations
  "document.view",
  "document.upload",
  "qa.view",
  "qa.inspect",
  "qa.certify",
  "finance.view", // costs, margins, profitability
  "finance.manage",
  "finance.revenue.view",
  "finance.costs.view",
  "finance.labour.view",
  "finance.profit.view",
  "hr.view",
  "hr.manage",
  // Company-wide budget and subcontractor rates are deliberately restricted
  // to the Owner and Administrator. Project-level costing choices remain a
  // finance permission.
  "labour.manage",
  "admin.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type RolePermissionOverrides = Partial<Record<Role, Capability[]>>;

const ALL: Capability[] = [...CAPABILITIES];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: ALL,
  admin: ALL,
  manager: [
    "project.view",
    "project.create",
    "project.edit",
    "project.transition",
    "project.transition.override",
    "customer.view",
    "customer.manage",
    "quote.view",
    "quote.edit",
    "quote.send",
    "schedule.view",
    "schedule.manage",
    "field.record",
    "document.view",
    "document.upload",
    "qa.view",
    "qa.inspect",
    "finance.revenue.view",
    "hr.view",
  ],
  staff: [
    "project.view",
    "schedule.view",
    "field.clock",
    "field.record",
    "document.view",
    "document.upload",
    "qa.view",
  ],
  finance: [
    "project.view",
    "customer.view",
    "quote.view",
    "document.view",
    "finance.view",
    "finance.manage",
    "finance.revenue.view",
    "finance.costs.view",
    "finance.labour.view",
    "finance.profit.view",
  ],
};

export function capabilitiesFor(role: Role, overrides?: RolePermissionOverrides): Capability[] {
  // Owner and Administrator are deliberately never customisable.
  if (role === "owner" || role === "admin") return ALL;
  return overrides?.[role] ?? ROLE_CAPABILITIES[role] ?? [];
}

export function can(role: Role, capability: Capability, overrides?: RolePermissionOverrides): boolean {
  return capabilitiesFor(role, overrides).includes(capability);
}

export function canAny(role: Role, capabilities: Capability[], overrides?: RolePermissionOverrides): boolean {
  return capabilities.some((c) => can(role, c, overrides));
}

/**
 * Someone who clocks onto jobs rather than runs them. They get the stripped-back
 * field experience: `/field` as their home, and none of the office navigation.
 * Deliberately derived from capabilities so a new site-based role inherits it.
 */
export function isFieldOnly(role: Role, overrides?: RolePermissionOverrides): boolean {
  return can(role, "field.clock", overrides) && !can(role, "project.edit", overrides);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  manager: "Manager",
  finance: "Finance",
  staff: "Staff",
};

/** The plain-language permission controls shown in Settings. Each Edit switch
 * grants the linked editing capabilities for that part of the app. */
export const PERMISSION_AREAS: Array<{ name: string; description: string; view: Capability[]; edit: Capability[] }> = [
  { name: "Projects", description: "Project details, status flow and activity", view: ["project.view"], edit: ["project.create", "project.edit", "project.transition", "project.transition.override"] },
  { name: "Customers", description: "Customer profiles, contacts and defaults", view: ["customer.view"], edit: ["customer.manage"] },
  { name: "Materials & price lists", description: "Materials, customer pricing and production templates", view: ["quote.view"], edit: ["quote.edit", "quote.approve", "quote.send"] },
  { name: "Calendar & Call-Ups", description: "Calendar and project Call-Ups", view: ["schedule.view"], edit: ["schedule.manage"] },
  { name: "Field", description: "On-site clock, materials, notes and variations", view: ["field.clock"], edit: ["field.record"] },
  { name: "Documents", description: "Project documents and uploads", view: ["document.view"], edit: ["document.upload"] },
  { name: "QA & compliance", description: "QA checks, inspections and certificates", view: ["qa.view"], edit: ["qa.inspect", "qa.certify"] },
  { name: "People", description: "People, availability and hourly rates", view: ["hr.view"], edit: ["hr.manage"] },
  { name: "Revenue", description: "Quoted and earned revenue figures", view: ["finance.revenue.view"], edit: ["finance.manage"] },
  { name: "Material costs", description: "Material cost figures across projects", view: ["finance.costs.view"], edit: ["finance.manage"] },
  { name: "Labour costs", description: "Hourly rates, time and labour cost figures", view: ["finance.labour.view"], edit: ["finance.manage"] },
  { name: "Profit & finance", description: "Profit, margins and the Finance module", view: ["finance.view", "finance.profit.view"], edit: ["finance.manage"] },
  { name: "Settings", description: "Organisation, status flow and access settings", view: ["admin.manage"], edit: ["admin.manage"] },
];
