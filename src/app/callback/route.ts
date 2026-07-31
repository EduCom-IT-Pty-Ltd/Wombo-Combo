import { NextResponse, type NextRequest } from "next/server";
import { handleAuth } from "@workos-inc/authkit-nextjs";
import { workosConfigured } from "@/lib/auth/workos-config";

/**
 * Where AuthKit sends the browser after a successful login. It swaps the
 * one-time code for a session and sets the encrypted cookie.
 *
 * The path here must match the "Redirect URIs" value in the WorkOS dashboard
 * and `NEXT_PUBLIC_WORKOS_REDIRECT_URI` exactly — a mismatch fails with an
 * opaque `redirect_uri` error that names neither side.
 */
export const GET = workosConfigured()
  ? handleAuth({ returnPathname: "/" })
  : async (_request: NextRequest) =>
      NextResponse.json(
        { error: "WorkOS is not configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID in .env.local." },
        { status: 501 },
      );
