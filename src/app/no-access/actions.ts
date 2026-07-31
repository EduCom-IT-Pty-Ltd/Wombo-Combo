"use server";

import { redirect } from "next/navigation";
import { workosConfigured } from "@/lib/auth/workos-config";

/**
 * Clears the WorkOS session and returns to the sign-in screen.
 *
 * Without this, a rejected user is stuck: the cookie is valid, so AuthKit keeps
 * signing them straight back in as the same person and they can never try a
 * different account.
 */
export async function signOutAction(): Promise<void> {
  if (!workosConfigured()) redirect("/");
  const { signOut } = await import("@workos-inc/authkit-nextjs");
  await signOut({ returnTo: "/" });
}
