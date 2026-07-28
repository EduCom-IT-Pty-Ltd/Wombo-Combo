"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Role } from "@/lib/db/schema/enums";
import { setDemoUser } from "@/app/actions/demo";

type DemoPerson = { id: string; name: string; role: Role };

/** Development-only user switcher. Unlike the role selector this changes the
 * actual local identity, so schedules, Field and time entries can be tested. */
export function UserSwitcher({ userId, people }: { userId: string; people: DemoPerson[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="hidden sm:inline">User</span>
      <select
        value={userId}
        disabled={pending}
        aria-label="Demo user"
        onChange={(event) => {
          startTransition(async () => {
            await setDemoUser(event.target.value);
            router.refresh();
          });
        }}
        className="h-8 max-w-28 rounded-[var(--radius)] border border-border-strong bg-surface px-2 text-xs text-foreground sm:max-w-36"
      >
        {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
    </label>
  );
}
