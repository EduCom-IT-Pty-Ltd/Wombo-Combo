import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/no-access/actions";

/**
 * Only rendered for real WorkOS sessions — in demo mode there is nothing to sign
 * out of, and the top bar shows the role and user switchers instead.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      {/* size-11 not size-9: this is a 44px tap target, per the mobile rules in
          CLAUDE.md. Field crews hit this on a phone, often wearing gloves. */}
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <LogOut className="size-4" aria-hidden />
      </button>
    </form>
  );
}
