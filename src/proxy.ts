import { NextResponse, type NextMiddleware } from "next/server";
import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { workosConfigured } from "@/lib/auth/workos-config";

/**
 * Gates the whole app behind a WorkOS session.
 *
 * Named `proxy.ts`, not `middleware.ts`: Next 16 deprecated the middleware file
 * convention in favour of this one. Same default export, same `config`.
 *
 * `middlewareAuth.enabled` means an unauthenticated request is redirected to
 * AuthKit rather than being allowed through for the page to sort out — so no
 * server component ever renders for a signed-out user.
 *
 * With WorkOS unconfigured the middleware is a pass-through, which keeps
 * `npm run dev` working against demo data with no environment at all.
 * `authkitProxy()` is never constructed in that case, because it throws when
 * the environment is missing.
 */
const passthrough: NextMiddleware = () => NextResponse.next();

export default workosConfigured()
  ? authkitProxy({
      middlewareAuth: {
        enabled: true,
        // `/callback` completes the login handshake and `/no-access` explains a
        // failed one. Both must be reachable without a session or they deadlock.
        unauthenticatedPaths: ["/callback", "/no-access"],
      },
    })
  : passthrough;

export const config = {
  // Everything except Next's own assets and static files. Note `_next/static`
  // and image routes are excluded, not just skipped, so the middleware never
  // runs on hot-reload traffic in dev.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
