"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ROLES, type Role } from "@/lib/db/schema/enums";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { setDemoRole } from "@/app/actions/demo";

/**
 * Demo-only affordance: flips the session role so you can see the app as an
 * owner, admin, manager, finance and staff access without changing accounts.
 *
 * Delete this component and its server action when WorkOS is wired up — the
 * role will come from the organization membership instead.
 */
export function RoleSwitcher({ role }: { role: Role }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="hidden sm:inline">Viewing as</span>
      <select
        value={role}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Role;
          startTransition(async () => {
            await setDemoRole(next);
            router.refresh();
          });
        }}
        className="h-8 rounded-[var(--radius)] border border-border-strong bg-surface px-2 text-xs text-foreground"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
