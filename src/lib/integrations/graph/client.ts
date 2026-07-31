import "server-only";

/**
 * Microsoft Graph, app-only.
 *
 * The app authenticates as itself with client credentials — no user context —
 * because most users of this platform have no M365 account at all. Human
 * attribution lives in our own `uploadedByUserId`, not in SharePoint's audit
 * trail.
 *
 * The registration holds `Sites.Selected`, which grants nothing by default; a
 * separate grant gives it write on one site. A 403 from Graph therefore usually
 * means that grant is missing rather than that the token is wrong.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly graphCode?: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export function graphConfigured(): boolean {
  return Boolean(
    process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET &&
      process.env.SHAREPOINT_SITE_ID,
  );
}

export function siteId(): string {
  const id = process.env.SHAREPOINT_SITE_ID;
  if (!id) throw new Error("SHAREPOINT_SITE_ID is not set.");
  return id;
}

/**
 * Tokens last about an hour. Cached in module scope, which on serverless means
 * per warm instance — a cold start pays for one extra token request rather than
 * failing, so this is a latency optimisation and not a correctness requirement.
 * Expiry is shaved by a minute so a token never expires mid-request.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph is not configured. Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID and MS_GRAPH_CLIENT_SECRET.",
    );
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      // App-only always requests the static `.default` scope: the permissions
      // are whatever was consented on the registration, not chosen per request.
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    // `error_description` carries the AADSTS code, which is the only part of a
    // token failure that actually says what to fix.
    throw new GraphError(
      `Token request failed: ${body.error_description ?? body.error ?? response.statusText}`,
      response.status,
      body.error,
    );
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.value;
}

/**
 * A Graph call with auth, throttle handling and errors worth reading.
 *
 * Graph answers 429 and occasional 503s under load with a `Retry-After`, and
 * honouring it is not optional — ignoring it is how an app gets throttled
 * harder. Retries are bounded and only cover the retryable statuses; a 403 is
 * a permissions problem that will never succeed on a retry.
 */
export async function graphFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  retries = 3,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH}${path}`;

  for (let attempt = 0; ; attempt++) {
    const token = await getToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
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

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      const error = parsed.error as { code?: string; message?: string } | undefined;
      throw new GraphError(
        `${init.method ?? "GET"} ${path} -> ${response.status} ${error?.code ?? ""}: ${error?.message ?? response.statusText}`,
        response.status,
        error?.code,
      );
    }

    return parsed as T;
  }
}
