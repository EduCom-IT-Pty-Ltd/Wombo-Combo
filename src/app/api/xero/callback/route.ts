import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireCapability } from "@/lib/auth/session";
import { completeAuthorisation, xeroConfigured } from "@/lib/integrations/xero/client";

export const XERO_STATE_COOKIE = "wc_xero_state";

/**
 * Where Xero sends the browser after authorisation.
 *
 * Guarded three ways: the caller must still hold the finance capability, the
 * `state` must match the one this app issued (defeating a forged callback that
 * would bind an attacker's Xero organisation to this workspace), and the state
 * cookie is single-use.
 */
export async function GET(request: NextRequest) {
  if (!xeroConfigured()) {
    return NextResponse.json(
      { error: "Xero is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI and XERO_TOKEN_KEY." },
      { status: 501 },
    );
  }

  const session = await requireCapability("finance.view");
  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const expectedState = jar.get(XERO_STATE_COOKIE)?.value;

  // Consumed whatever happens, so a state value is never replayable.
  jar.delete(XERO_STATE_COOKIE);

  const error = params.get("error");
  if (error) {
    return redirectToFinance(request, `Xero authorisation was declined (${error}).`);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToFinance(request, "Xero authorisation could not be verified. Start again from Finance.");
  }

  try {
    const { tenantName } = await completeAuthorisation(session.org.id, code, session.user.id);
    return redirectToFinance(request, `Connected to ${tenantName ?? "Xero"}.`, true);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown error";
    return redirectToFinance(request, `Could not complete the Xero connection: ${message}`);
  }
}

function redirectToFinance(request: NextRequest, message: string, ok = false) {
  const url = new URL("/finance", request.nextUrl.origin);
  url.searchParams.set(ok ? "xero" : "xeroError", message);
  return NextResponse.redirect(url);
}
