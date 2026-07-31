import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { xeroConnections } from "@/lib/db/schema/integrations";
import { decryptToken, encryptToken, tokenKeyConfigured } from "./crypto";

/**
 * Xero, via the Web App (three-legged OAuth) flow.
 *
 * The awkward part is refresh-token rotation: exchanging a refresh token
 * invalidates it and returns a new one. Persisting the new pair therefore has to
 * happen *before* the access token is handed to a caller — if a request failed
 * after using the token but before saving it, the stored token would already be
 * dead and the connection would need re-authorising by hand.
 *
 * Xero allows the same refresh token to be retried for 30 minutes, which is what
 * makes a crash between the exchange and the write survivable rather than fatal.
 */

const XERO_API = "https://api.xero.com";
/** Token exchange. Distinct from the authorize host — they are not the same. */
const XERO_IDENTITY = "https://identity.xero.com";
const XERO_AUTHORIZE = "https://login.xero.com/identity/connect/authorize";

/**
 * Least privilege: contacts and invoices to write, settings to read account
 * codes and tax rates.
 *
 * Granular scopes, not the broad `accounting.transactions`. That scope is
 * deprecated and is simply unavailable to apps created on or after 2 March 2026,
 * so requesting it here would fail authorisation outright on a new app.
 *
 * `offline_access` is what yields a refresh token. Without it the connection
 * dies after the first access token expires, about half an hour later.
 */
export const XERO_SCOPES = [
  "offline_access",
  "accounting.contacts",
  "accounting.invoices",
  "accounting.settings.read",
] as const;

export class XeroError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly needsReauthorisation = false,
  ) {
    super(message);
    this.name = "XeroError";
  }
}

export function xeroConfigured(): boolean {
  return Boolean(
    process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_REDIRECT_URI,
  ) && tokenKeyConfigured();
}

function basicAuth(): string {
  return Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
}

/** Where to send the browser to start authorisation. */
export function buildAuthorisationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
    scope: XERO_SCOPES.join(" "),
    state,
  });
  return `${XERO_AUTHORIZE}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function exchange(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${XERO_IDENTITY}/connect/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth()}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  const json = (await response.json()) as Partial<TokenResponse> & { error?: string; error_description?: string };

  if (!response.ok || !json.access_token || !json.refresh_token) {
    // `invalid_grant` means the refresh token is spent or expired. That is the
    // one failure a retry cannot fix — a human has to reconnect.
    const terminal = json.error === "invalid_grant";
    throw new XeroError(
      `Xero token exchange failed: ${json.error_description ?? json.error ?? response.statusText}`,
      response.status,
      terminal,
    );
  }
  return json as TokenResponse;
}

/** Completes the authorisation code flow and stores the connection. */
export async function completeAuthorisation(
  orgId: string,
  code: string,
  connectedByUserId: string | null,
): Promise<{ tenantId: string; tenantName: string | null }> {
  const tokens = await exchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
  });

  // Which Xero organisation was authorised is only knowable after the exchange:
  // the user picks it on Xero's consent screen, not in our request.
  const connections = (await (
    await fetch(`${XERO_API}/connections`, {
      headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
    })
  ).json()) as Array<{ tenantId: string; tenantName: string }>;

  const tenant = connections[0];
  if (!tenant) {
    throw new XeroError("Authorisation succeeded but no Xero organisation was granted.", 400, true);
  }

  await db()
    .insert(xeroConnections)
    .values({
      orgId,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      accessTokenEncrypted: encryptToken(tokens.access_token),
      refreshTokenEncrypted: encryptToken(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      lastRefreshedAt: new Date(),
      connectedByUserId,
      lastError: null,
    })
    // Reconnecting replaces the existing connection rather than failing on the
    // unique index — the usual reason to reconnect is that the old one broke.
    .onConflictDoUpdate({
      target: xeroConnections.orgId,
      set: {
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        accessTokenEncrypted: encryptToken(tokens.access_token),
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastRefreshedAt: new Date(),
        connectedByUserId,
        lastError: null,
        updatedAt: new Date(),
      },
    });

  return { tenantId: tenant.tenantId, tenantName: tenant.tenantName };
}

export interface XeroConnection {
  tenantId: string;
  tenantName: string | null;
  expiresAt: Date;
  lastRefreshedAt: Date;
  lastError: string | null;
}

export async function getConnection(orgId: string): Promise<XeroConnection | null> {
  const [row] = await db().select().from(xeroConnections).where(eq(xeroConnections.orgId, orgId)).limit(1);
  return row
    ? {
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        expiresAt: row.expiresAt,
        lastRefreshedAt: row.lastRefreshedAt,
        lastError: row.lastError,
      }
    : null;
}

export async function disconnect(orgId: string): Promise<void> {
  await db().delete(xeroConnections).where(eq(xeroConnections.orgId, orgId));
}

/** Refreshed this far before expiry so a token never dies mid-request. */
const REFRESH_BUFFER_MS = 120_000;

/**
 * A valid access token, refreshing first if it is close to expiry.
 *
 * The new token pair is written before the access token is returned, so the
 * stored refresh token is never one that has already been spent.
 */
async function getAccessToken(orgId: string): Promise<{ token: string; tenantId: string }> {
  const [row] = await db().select().from(xeroConnections).where(eq(xeroConnections.orgId, orgId)).limit(1);
  if (!row) throw new XeroError("Xero is not connected.", 401, true);

  if (row.expiresAt.getTime() - REFRESH_BUFFER_MS > Date.now()) {
    return { token: decryptToken(row.accessTokenEncrypted), tenantId: row.tenantId };
  }

  try {
    const tokens = await exchange({
      grant_type: "refresh_token",
      refresh_token: decryptToken(row.refreshTokenEncrypted),
    });

    await db()
      .update(xeroConnections)
      .set({
        accessTokenEncrypted: encryptToken(tokens.access_token),
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastRefreshedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(xeroConnections.orgId, orgId));

    return { token: tokens.access_token, tenantId: row.tenantId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Recorded so the Finance screen can say the connection is broken instead of
    // every export failing with an opaque error.
    await db()
      .update(xeroConnections)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(xeroConnections.orgId, orgId));
    throw error;
  }
}

/**
 * A Xero API call with auth, the tenant header, and throttle handling.
 *
 * Xero allows 60 calls/minute and 5 concurrent per tenant, answering 429 with a
 * `Retry-After`. Honouring it is not optional — ignoring it lengthens the
 * penalty rather than getting the call through sooner.
 */
export async function xeroFetch<T = unknown>(
  orgId: string,
  path: string,
  init: RequestInit = {},
  retries = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { token, tenantId } = await getAccessToken(orgId);
    const response = await fetch(`${XERO_API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });

    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new XeroError(
        `${init.method ?? "GET"} ${path} -> ${response.status}: ${
          (parsed.Detail as string) ?? (parsed.Message as string) ?? response.statusText
        }`,
        response.status,
        response.status === 401,
      );
    }

    return parsed as T;
  }
}
