"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLES, type Role } from "@/lib/db/schema/enums";
import { DEMO_ROLE_COOKIE, DEMO_USER_COOKIE } from "@/lib/auth/session";
import { readLocalStore } from "@/lib/data/local-store";

/** Demo-only. Remove alongside `RoleSwitcher` when WorkOS lands. */
export async function setDemoRole(role: Role) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);

  const jar = await cookies();
  jar.set(DEMO_ROLE_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

/** Demo-only. Selects a real local person so their calendar and field access can be tested. */
export async function setDemoUser(userId: string) {
  const person = (await readLocalStore()).people.find((item) => item.id === userId);
  if (!person) throw new Error("Unknown demo user");

  const jar = await cookies();
  jar.set(DEMO_USER_COOKIE, person.id, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.set(DEMO_ROLE_COOKIE, person.role, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
