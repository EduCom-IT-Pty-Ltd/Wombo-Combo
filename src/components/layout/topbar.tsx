import { Search } from "lucide-react";
import type { Role } from "@/lib/db/schema/enums";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { Avatar } from "@/components/ui";
import { RoleSwitcher } from "./role-switcher";

export function TopBar({
  orgName,
  userName,
  initials,
  role,
  isDemo,
}: {
  orgName: string;
  userName: string;
  initials: string;
  role: Role;
  isDemo: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface px-4 pt-safe">
      {/* Org identity is in the sidebar on desktop; repeat it on mobile. */}
      <div className="flex items-center gap-2 lg:hidden">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          WC
        </span>
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

      <div className="flex items-center gap-3">
        {isDemo ? <RoleSwitcher role={role} /> : null}
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
