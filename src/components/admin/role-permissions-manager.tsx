"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, LockKeyhole, Minus } from "lucide-react";
import type { Role } from "@/lib/db/schema/enums";
import { capabilitiesFor, PERMISSION_AREAS, ROLE_LABELS, type Capability, type RolePermissionOverrides } from "@/lib/domain/permissions";
import { saveRolePermissionsAction, type RolePermissionsActionState } from "@/app/actions/role-permissions";
import { Button, Card, CardHeader } from "@/components/ui";

const editableRoles = ["manager", "finance", "staff"] as const;
const initialState: RolePermissionsActionState = { ok: false };

function selectedFor(role: Role, overrides: RolePermissionOverrides) {
  return new Set<Capability>(capabilitiesFor(role, overrides));
}

export function RolePermissionsManager({ overrides }: { overrides: RolePermissionOverrides }) {
  const [permissions, setPermissions] = useState<RolePermissionOverrides>(() => Object.fromEntries(editableRoles.map((role) => [role, capabilitiesFor(role, overrides)])));
  const [state, action, pending] = useActionState(saveRolePermissionsAction, initialState);
  const selected = useMemo(() => Object.fromEntries(editableRoles.map((role) => [role, selectedFor(role, permissions)])) as Record<(typeof editableRoles)[number], Set<Capability>>, [permissions]);

  function toggle(role: (typeof editableRoles)[number], capabilities: Capability[], checked: boolean, linkedView: Capability[] = []) {
    setPermissions((current) => {
      const next = new Set(capabilitiesFor(role, current));
      capabilities.forEach((capability) => checked ? next.add(capability) : next.delete(capability));
      if (checked) linkedView.forEach((capability) => next.add(capability));
      return { ...current, [role]: [...next] };
    });
  }

  return <form action={action}><input type="hidden" name="permissions" value={JSON.stringify(permissions)} /><Card>
    <CardHeader title="Roles & access" description="Choose exactly what Manager, Finance and Staff can view or edit. Edit automatically includes View for that area." />
    <div className="mx-4 mb-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><span className="font-bold text-foreground">Owner and Administrator</span> always have full access and are locked. Changes are saved locally for testing and apply to the selected role immediately.</div>
    <div className="overflow-x-auto border-t border-border-subtle"><table className="w-full min-w-[58rem] text-sm"><thead><tr className="border-b border-border-subtle"><th className="sticky left-0 z-10 min-w-72 bg-surface px-4 py-3 text-left text-xs font-bold text-muted-foreground">Area</th><th className="min-w-28 px-3 py-3 text-left text-xs font-bold text-muted-foreground">Owner</th><th className="min-w-28 px-3 py-3 text-left text-xs font-bold text-muted-foreground">Administrator</th>{editableRoles.map((role) => <th key={role} className="min-w-32 px-3 py-3 text-left text-xs font-bold text-muted-foreground">{ROLE_LABELS[role]}</th>)}</tr></thead><tbody className="divide-y divide-border-subtle">{PERMISSION_AREAS.map((area) => <tr key={area.name}><td className="sticky left-0 z-10 bg-surface px-4 py-3"><p className="font-bold">{area.name}</p><p className="mt-0.5 max-w-72 text-xs leading-relaxed text-muted-foreground">{area.description}</p></td><td className="px-3 py-3 align-top"><Locked /></td><td className="px-3 py-3 align-top"><Locked /></td>{editableRoles.map((role) => { const hasView = area.view.every((capability) => selected[role].has(capability)); const hasEdit = area.edit.length > 0 && area.edit.every((capability) => selected[role].has(capability)); return <td key={role} className="px-3 py-3 align-top"><div className="flex flex-col gap-2"><Toggle label="View" checked={hasView} onChange={(checked) => { toggle(role, area.view, checked); if (!checked) toggle(role, area.edit, false); }} /><Toggle label="Edit" checked={hasEdit} disabled={!area.edit.length} onChange={(checked) => toggle(role, area.edit, checked, area.view)} /></div></td>; })}</tr>)}</tbody></table></div>
    <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3 sm:px-5"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save permissions"}</Button>{state.message ? <p className={state.ok ? "text-xs text-[var(--tone-emerald-fg)]" : "text-xs text-[var(--tone-rose-fg)]"}>{state.message}</p> : null}</div>
  </Card></form>;
}

function Locked() { return <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--tone-emerald-fg)]"><LockKeyhole className="size-3.5" /> Full access</span>; }
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) { return <label className={`flex items-center gap-2 text-xs font-semibold ${disabled ? "text-muted-foreground/50" : "cursor-pointer text-foreground"}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-4 rounded border-border-strong accent-primary" />{checked ? <Check className="size-3.5 text-[var(--tone-emerald-fg)]" /> : <Minus className="size-3.5 text-muted-foreground" />}{label}</label>; }
