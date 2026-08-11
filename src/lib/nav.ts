import type { Role } from "@/lib/db/schema/enums";
import { type Capability, can, isFieldOnly, type RolePermissionOverrides } from "@/lib/domain/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: string;
  icon: IconName;
  /** Hidden unless the member holds this capability. Always shown when absent. */
  capability?: Capability;
  /** Order in the mobile bottom bar; omitted items live under "More". */
  mobileOrder?: number;
}

export type IconName =
  | "home"
  | "folder"
  | "calendar"
  | "hardhat"
  | "labour"
  | "users"
  | "receipt"
  | "materials"
  | "production"
  | "shield"
  | "settings"
  | "book"
  | "clipboard"
  | "more";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Home", icon: "home", capability: "project.view", mobileOrder: 1 },
  { href: "/projects", label: "Projects", icon: "folder", capability: "project.view", mobileOrder: 2 },
  { href: "/schedule", label: "Calendar", icon: "calendar", capability: "schedule.view", mobileOrder: 3 },
  { href: "/field", label: "Field", shortLabel: "My Day", icon: "hardhat", capability: "field.clock", mobileOrder: 0 },
  { href: "/customers", label: "Customers", icon: "users", capability: "customer.view" },
  { href: "/materials", label: "Materials", icon: "materials", capability: "quote.edit" },
  { href: "/finance", label: "Finance", icon: "receipt", capability: "finance.profit.view" },
  { href: "/qa", label: "QA & Compliance", shortLabel: "QA", icon: "shield", capability: "qa.view" },
  { href: "/hr", label: "People", icon: "users", capability: "hr.view" },
  { href: "/labour", label: "Labour", icon: "labour", capability: "labour.manage" },
  { href: "/swms-template", label: "SWMS template", icon: "clipboard", capability: "admin.manage" },
  { href: "/admin", label: "Settings", icon: "settings", capability: "admin.manage" },
  // No capability: help is for everyone, including a role somebody has stripped
  // back to almost nothing.
  { href: "/docs", label: "Guides", icon: "book" },
];

export type SettingsIconName = "building" | "workflow" | "shield" | "automation";

/**
 * Settings is a section, not a page — each entry is its own route under
 * `/admin` so nobody has to scroll past the status flow to reach permissions.
 */
export interface SettingsSection {
  segment: string;
  label: string;
  /** Plain-language summary, shown on the settings index and as the page description. */
  description: string;
  icon: SettingsIconName;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    segment: "organisation",
    label: "Organisation",
    description: "Company name, project number prefix, currency, timezone and the logo shown across the app.",
    icon: "building",
  },
  {
    segment: "workflow",
    label: "Project workflow",
    description: "The stages a project moves through, plus the checklist and details each stage needs.",
    icon: "workflow",
  },
  {
    segment: "permissions",
    label: "Roles & access",
    description: "Choose what Manager, Finance and Staff can view or edit. Edit always includes View.",
    icon: "shield",
  },
  {
    segment: "automations",
    label: "Automations",
    description: "What the portal does on its own as a project moves through the workflow.",
    icon: "automation",
  },
];

export function settingsSectionFor(pathname: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((section) => pathname === `/admin/${section.segment}`);
}

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
  { segment: "field", label: "Field", capability: "project.view" },
  { segment: "documents", label: "Documents", capability: "document.view" },
  { segment: "qa", label: "QA", capability: "qa.view" },
  { segment: "costing", label: "Costing", capability: "finance.profit.view" },
  { segment: "activity", label: "Activity", capability: "project.view" },
  { segment: "swms", label: "SWMS", capability: "document.view" },
];

/**
 * Navigation for a role, already capability-filtered. Field-only crew get a
 * three-destination bar — My Day, Calendar, Projects — because the dashboard
 * redirects them to `/field` anyway and everything else is office work.
 */
export function navItemsFor(role: Role, overrides?: RolePermissionOverrides): NavItem[] {
  const items = NAV_ITEMS.filter((item) => !item.capability || can(role, item.capability, overrides));
  return isFieldOnly(role, overrides) ? items.filter((item) => item.href !== "/") : items;
}
