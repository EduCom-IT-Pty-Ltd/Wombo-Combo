import type { Role } from "@/lib/db/schema/enums";
import { type Capability, can, isFieldOnly } from "@/lib/domain/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: string;
  icon: IconName;
  /** Hidden unless the member holds this capability. */
  capability: Capability;
  /** Order in the mobile bottom bar; omitted items live under "More". */
  mobileOrder?: number;
}

export type IconName =
  | "home"
  | "folder"
  | "calendar"
  | "hardhat"
  | "users"
  | "receipt"
  | "materials"
  | "production"
  | "shield"
  | "settings"
  | "more";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Home", icon: "home", capability: "project.view", mobileOrder: 1 },
  { href: "/projects", label: "Projects", icon: "folder", capability: "project.view", mobileOrder: 2 },
  { href: "/schedule", label: "Calendar", icon: "calendar", capability: "schedule.view", mobileOrder: 3 },
  { href: "/field", label: "Field", shortLabel: "My Day", icon: "hardhat", capability: "field.clock", mobileOrder: 0 },
  { href: "/customers", label: "Customers", icon: "users", capability: "customer.view" },
  { href: "/materials", label: "Materials", icon: "materials", capability: "quote.edit" },
  { href: "/production-templates", label: "Production templates", icon: "production", capability: "quote.edit" },
  { href: "/finance", label: "Finance", icon: "receipt", capability: "finance.view" },
  { href: "/qa", label: "QA & Compliance", shortLabel: "QA", icon: "shield", capability: "qa.view" },
  { href: "/hr", label: "People", icon: "users", capability: "hr.view" },
  { href: "/admin", label: "Settings", icon: "settings", capability: "admin.manage" },
];

/** Project workspace tabs — the spec's "Project Workspace" module. */
export interface ProjectTab {
  segment: string;
  label: string;
  capability: Capability;
}

export const PROJECT_TABS: ProjectTab[] = [
  { segment: "", label: "Overview", capability: "project.view" },
  { segment: "quote", label: "Quote", capability: "quote.view" },
  { segment: "schedule", label: "Schedule", capability: "schedule.view" },
  { segment: "tasks", label: "Tasks", capability: "project.view" },
  { segment: "field", label: "Field", capability: "project.view" },
  { segment: "documents", label: "Documents", capability: "document.view" },
  { segment: "qa", label: "QA", capability: "qa.view" },
  { segment: "costing", label: "Costing", capability: "finance.view" },
  { segment: "activity", label: "Activity", capability: "project.view" },
];

/**
 * Navigation for a role, already capability-filtered. Field-only crew get a
 * three-destination bar — My Day, Calendar, Projects — because the dashboard
 * redirects them to `/field` anyway and everything else is office work.
 */
export function navItemsFor(role: Role): NavItem[] {
  const items = NAV_ITEMS.filter((item) => can(role, item.capability));
  return isFieldOnly(role) ? items.filter((item) => item.href !== "/") : items;
}
