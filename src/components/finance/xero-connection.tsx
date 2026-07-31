import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import { connectXero, disconnectXero, getXeroStatus } from "@/app/actions/xero";
import { Button } from "@/components/ui";

/**
 * Xero connection panel.
 *
 * Surfaces the 60-day refresh-token expiry rather than letting a connection die
 * quietly: the failure mode of this integration is silence, and the first sign
 * would otherwise be invoices not reaching Xero at month end.
 */
export async function XeroConnectionPanel({ notice }: { notice?: { message: string; ok: boolean } }) {
  const status = await getXeroStatus();

  if (!status.configured) {
    return (
      <p className="border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground">
        Xero is not configured on this deployment.
      </p>
    );
  }

  const expiringSoon = status.daysUntilExpiry !== null && status.daysUntilExpiry <= 14;

  return (
    <div className="space-y-3 border-t border-border-subtle px-4 py-3">
      {notice ? (
        <p className={`text-xs ${notice.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>
          {notice.message}
        </p>
      ) : null}

      {status.connection ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <CheckCircle2 className="size-4 shrink-0 text-[var(--tone-emerald-fg)]" aria-hidden />
            <span className="font-medium">Connected to {status.connection.tenantName ?? "Xero"}</span>
            <span className="text-muted-foreground">
              · reauthorisation needed in {status.daysUntilExpiry} days if unused
            </span>
          </div>

          {status.connection.lastError ? (
            <p className="flex items-start gap-2 text-xs text-[var(--tone-rose-fg)]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Last sync failed: {status.connection.lastError}</span>
            </p>
          ) : null}

          {expiringSoon ? (
            <p className="flex items-start gap-2 text-xs text-[var(--tone-amber-fg)]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Xero expires a connection 60 days after its last use. Reconnect to reset the clock — exporting an
                invoice also resets it.
              </span>
            </p>
          ) : null}

          <form action={disconnectXero}>
            <Button type="submit" variant="secondary" size="sm">
              Disconnect
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Connect Xero to push invoices for jobs at Ready for Invoice. Invoices are created as drafts — nothing is
            sent to a customer without someone approving it in Xero.
          </p>
          <form action={connectXero}>
            {/* 44px tap target: reachable from a phone, per the mobile rules. */}
            <Button type="submit" variant="primary" className="min-h-11">
              <Link2 className="size-4" aria-hidden /> Connect to Xero
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
