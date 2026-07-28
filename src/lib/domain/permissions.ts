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
  "hr.view",
  "hr.manage",
  "admin.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL: Capability[] = [...CAPABILITIES];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: ALL,
  admin: ALL,
  project_manager: [
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
    "finance.view",
    "hr.view",
  ],
  scheduler: [
    "project.view",
    "project.transition",
    "customer.view",
    "schedule.view",
    "schedule.manage",
    "document.view",
    "hr.view",
  ],
  estimator: [
    "project.view",
    "project.create",
    "project.edit",
    "project.transition",
    "customer.view",
    "customer.manage",
    "quote.view",
    "quote.edit",
    "quote.send",
    "document.view",
    "document.upload",
    "finance.view",
  ],
  // Deliberately no `finance.view`: installers should not see job margins.
  installer: [
    "project.view",
    "schedule.view",
    "field.clock",
    "field.record",
    "document.view",
    "document.upload",
    "qa.view",
  ],
  qa_inspector: [
    "project.view",
    "project.transition",
    "schedule.view",
    "document.view",
    "document.upload",
    "qa.view",
    "qa.inspect",
    "qa.certify",
  ],
  finance: [
    "project.view",
    "customer.view",
    "quote.view",
    "document.view",
    "finance.view",
    "finance.manage",
  ],
  viewer: ["project.view", "customer.view", "schedule.view", "document.view"],
};

export function capabilitiesFor(role: Role): Capability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

export function can(role: Role, capability: Capability): boolean {
  return capabilitiesFor(role).includes(capability);
}

export function canAny(role: Role, capabilities: Capability[]): boolean {
  return capabilities.some((c) => can(role, c));
}

/**
 * Someone who clocks onto jobs rather than runs them. They get the stripped-back
 * field experience: `/field` as their home, and none of the office navigation.
 * Deliberately derived from capabilities so a new site-based role inherits it.
 */
export function isFieldOnly(role: Role): boolean {
  return can(role, "field.clock") && !can(role, "project.edit");
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  project_manager: "Project Manager",
  scheduler: "Scheduler",
  estimator: "Estimator",
  installer: "Installer",
  qa_inspector: "QA Inspector",
  finance: "Finance",
  viewer: "Viewer",
};
