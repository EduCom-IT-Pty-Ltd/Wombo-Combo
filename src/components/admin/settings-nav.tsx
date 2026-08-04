"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Building2, ShieldCheck, Workflow, Zap } from "lucide-react";
import { SETTINGS_SECTIONS, settingsSectionFor, type SettingsIconName } from "@/lib/nav";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

const ICONS = {
  building: Building2,
  workflow: Workflow,
  shield: ShieldCheck,
  automation: Zap,
} as const satisfies Record<SettingsIconName, unknown>;

export function SettingsIcon({ name, className }: { name: SettingsIconName; className?: string }) {
  const Component = ICONS[name];
  return <Component className={className} strokeWidth={1.75} aria-hidden />;
}

/**
 * One header for the whole section: the index reads "Settings", a section reads
 * its own name so the phone screen is not just the word "Settings" five times.
 */
export function SettingsHeader() {
  const section = settingsSectionFor(usePathname());

  return (
    <div className="space-y-2">
      {section ? (
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="size-3.5" /> All settings
        </Link>
      ) : null}
      <PageHeader
        title={section?.label ?? "Settings"}
        description={section?.description ?? "Everything that changes how the portal behaves for your organisation."}
      />
    </div>
  );
}

/** Desktop rail. On mobile the index page and the back link do this job. */
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-[4.5rem] lg:block">
      <ul className="space-y-0.5">
        <li>
          <SettingsNavLink href="/admin" label="Overview" active={pathname === "/admin"} />
        </li>
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.segment}>
            <SettingsNavLink
              href={`/admin/${section.segment}`}
              label={section.label}
              icon={section.icon}
              active={pathname === `/admin/${section.segment}`}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SettingsNavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon?: SettingsIconName;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-all duration-150",
        active
          ? "neumorphic-nav-active font-semibold text-primary shadow-sm"
          : "neumorphic-nav-item text-muted-foreground hover:translate-x-0.5 hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {icon ? <SettingsIcon name={icon} className="size-4.5 shrink-0" /> : <span className="size-4.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </Link>
  );
}
