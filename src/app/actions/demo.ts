"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLES, type Role } from "@/lib/db/schema/enums";
import { DEMO_ROLE_COOKIE } from "@/lib/auth/session";

/** Demo-only. Remove alongside `RoleSwitcher` when WorkOS lands. */
export async function setDemoRole(role: Role) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);

  const jar = await cookies();
  jar.set(DEMO_ROLE_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
