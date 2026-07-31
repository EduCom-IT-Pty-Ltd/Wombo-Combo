import type { Metadata } from "next";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: "No access" };

/**
 * Where `loadSession()` sends someone who authenticated with WorkOS but is not
 * a member of this organisation.
 *
 * Deliberately outside the `(app)` route group: that layout calls `getSession()`,
 * so rendering this inside it would redirect here again, forever.
 *
 * The copy names no internal detail — someone who guessed their way to a login
 * screen learns only that they are not on the list.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  const detail =
    reason === "organisation"
      ? "Your account belongs to a different organisation."
      : "Your account isn't set up for this workspace yet.";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">You don&rsquo;t have access</h1>
        <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask whoever invited you to add your email address, then sign in again.
        </p>

        <form action={signOutAction} className="mt-8">
          {/* 44px min height — this can be reached on a phone in the field. */}
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
