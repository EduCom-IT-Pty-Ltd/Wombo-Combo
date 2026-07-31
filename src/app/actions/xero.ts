"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/session";
import {
  buildAuthorisationUrl,
  disconnect,
  getConnection,
  xeroConfigured,
  type XeroConnection,
} from "@/lib/integrations/xero/client";
import { XERO_STATE_COOKIE } from "@/app/api/xero/callback/route";

export interface XeroStatus {
  configured: boolean;
  connection: XeroConnection | null;
  /** Xero kills a refresh token 60 days after its last use. */
  daysUntilExpiry: number | null;
}

export async function getXeroStatus(): Promise<XeroStatus> {
  const session = await requireCapability("finance.view");
  if (!xeroConfigured()) return { configured: false, connection: null, daysUntilExpiry: null };

  const connection = await getConnection(session.org.id);
  if (!connection) return { configured: true, connection: null, daysUntilExpiry: null };

  const elapsedDays = (Date.now() - connection.lastRefreshedAt.getTime()) / 86_400_000;
  return { configured: true, connection, daysUntilExpiry: Math.max(0, Math.round(60 - elapsedDays)) };
}

/**
 * Begins authorisation. The `state` is random per attempt and stored in an
 * httpOnly cookie, so the callback can prove the response belongs to a flow this
 * app started rather than one an attacker induced.
 */
export async function connectXero(): Promise<void> {
  await requireCapability("finance.view");
  if (!xeroConfigured()) throw new Error("Xero is not configured.");

  const state = randomUUID();
  const jar = await cookies();
  jar.set(XERO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long enough to read Xero's consent screen, short enough not to linger.
    maxAge: 600,
  });

  redirect(buildAuthorisationUrl(state));
}

/** Returns void so it can be used directly as a `<form action>`. */
export async function disconnectXero(): Promise<void> {
  const session = await requireCapability("finance.view");
  await disconnect(session.org.id);
  revalidatePath("/finance");
}
