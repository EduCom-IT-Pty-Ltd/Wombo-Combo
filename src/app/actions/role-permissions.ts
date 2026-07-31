"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { CAPABILITIES, PERMISSION_AREAS, type Capability, type RolePermissionOverrides } from "@/lib/domain/permissions";
import { saveRolePermissions } from "@/lib/data/local-store";
import { hasDatabase } from "@/lib/db";
import { saveRolePermissions as savePgRolePermissions } from "@/lib/data/pg/settings";

const editableRoles = ["manager", "finance", "staff"] as const;
const capabilitySchema = z.enum(CAPABILITIES);
const payloadSchema = z.object({
  manager: z.array(capabilitySchema).optional(),
  finance: z.array(capabilitySchema).optional(),
  staff: z.array(capabilitySchema).optional(),
});
export type RolePermissionsActionState = { ok: boolean; message?: string };

/** Persists the configurable role matrix for the local test environment. */
export async function saveRolePermissionsAction(_state: RolePermissionsActionState, formData: FormData): Promise<RolePermissionsActionState> {
  const session = await requireCapability("admin.manage");
  const raw = formData.get("permissions");
  if (typeof raw !== "string") return { ok: false, message: "Permission settings were missing." };
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return { ok: false, message: "Permission settings were invalid." }; }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) return { ok: false, message: "Permission settings were invalid." };

  const cleaned: RolePermissionOverrides = {};
  for (const role of editableRoles) {
    const selected = new Set<Capability>(parsed.data[role] ?? []);
    // An edit permission always includes its matching view access.
    for (const area of PERMISSION_AREAS) {
      if (area.edit.some((capability) => selected.has(capability))) area.view.forEach((capability) => selected.add(capability));
    }
    cleaned[role] = CAPABILITIES.filter((capability) => selected.has(capability));
  }
  if (hasDatabase) await savePgRolePermissions(session.org.id, cleaned);
  else await saveRolePermissions(cleaned);
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  return { ok: true, message: "Role permissions saved." };
}
