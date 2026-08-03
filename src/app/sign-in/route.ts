import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { workosConfigured } from "@/lib/auth/workos-config";

/**
 * The "Sign-in URL" WorkOS points at when *it* starts a login rather than us —
 * accepting an invitation email, a magic link, or an admin impersonating a user.
 *
 * Without this route those flows land straight on `/callback` with a `code` and
 * no `state`, because no PKCE challenge was ever issued. `handleAuth` rejects
 * that as `missing_auth_params` and the user sees "Couldn't sign in", which
 * names neither the cause nor the fix.
 *
 * Sending them here first means the handshake always starts from our side:
 * `getSignInUrl` mints the PKCE pair, sets the cookie, and hands WorkOS a state
 * to give back. The invitation is unaffected — AuthKit still remembers it and
 * completes it once the user authenticates.
 *
 * This path must match "Sign-in URL" under Redirects in the WorkOS dashboard,
 * per environment. Staging and production each have their own.
 */
export async function GET(request: NextRequest) {
  if (!workosConfigured()) {
    return NextResponse.json(
      { error: "WorkOS is not configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID in .env.local." },
      { status: 501 },
    );
  }

  // WorkOS forwards the address it already knows on an invitation or magic-link
  // hand-off, so the sign-in screen arrives pre-filled rather than asking a
  // person who just clicked a link addressed to them who they are.
  const loginHint = request.nextUrl.searchParams.get("login_hint") ?? undefined;

  const { getSignInUrl } = await import("@workos-inc/authkit-nextjs");
  redirect(await getSignInUrl({ loginHint }));
}
