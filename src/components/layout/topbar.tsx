import { Search } from "lucide-react";
import Image from "next/image";
import type { Role } from "@/lib/db/schema/enums";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { Avatar } from "@/components/ui";
import { RoleSwitcher } from "./role-switcher";
import { UserSwitcher } from "./user-switcher";
import { ThemeToggle } from "./theme";
import { ActiveShiftLink } from "@/components/field/active-shift-link";

export function TopBar({
  orgName,
  userName,
  initials,
  role,
  isDemo,
  activeShift,
  logoUrl,
  userId,
  demoPeople,
}: {
  orgName: string;
  userName: string;
  initials: string;
  role: Role;
  isDemo: boolean;
  activeShift?: { projectId: string; projectTitle: string; startedAt: string; paused: boolean } | null;
  logoUrl?: string | null;
  userId: string;
  demoPeople?: Array<{ id: string; name: string; role: Role }>;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface/90 px-4 pt-safe shadow-[0_4px_18px_rgb(15_23_42/0.025)] backdrop-blur">
      {/* Org identity is in the sidebar on desktop; repeat it on mobile.
          `min-w-0` lets a long org name truncate rather than shove the theme
          toggle and avatar off the right edge of a phone. */}
      <div className="flex min-w-0 items-center gap-2 lg:hidden">
        {logoUrl ? <Image src={logoUrl} alt="" width={28} height={28} className="size-7 shrink-0 rounded-lg object-contain" /> : <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm">WC</span>}
        <span className="truncate text-sm font-semibold">{orgName}</span>
      </div>

      <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:flex-1">
        <div className="relative hidden max-w-sm flex-1 lg:block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search projects, customers, sites…"
            className="h-9 w-full rounded-[var(--radius)] border border-border-subtle bg-surface-muted pr-3 pl-8 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        {activeShift ? <ActiveShiftLink {...activeShift} /> : null}
        {isDemo && demoPeople ? <UserSwitcher userId={userId} people={demoPeople} /> : null}
        {isDemo ? <RoleSwitcher role={role} /> : null}
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <Avatar initials={initials} />
          <div className="hidden leading-tight sm:block">
            <p className="text-xs font-medium">{userName}</p>
            <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[role]}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
