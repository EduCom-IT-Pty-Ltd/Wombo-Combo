"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Lock } from "lucide-react";
import { transitionProject, type ActionResult } from "@/app/actions/projects";
import { STATUS_META, type ProjectStatus, type TransitionContext, checkTransition } from "@/lib/domain/status";
import { Button, Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { useStatusSettings } from "@/components/status-settings-provider";

/**
 * Status transition control.
 *
 * Guards are evaluated on the client for instant feedback and again in the
 * server action — the client copy is a courtesy, the server copy is the rule.
 */
export function StatusControl({
  projectId,
  status,
  heldFromStatus,
  allowed,
  context,
  canOverride,
}: {
  projectId: string;
  status: ProjectStatus;
  heldFromStatus: ProjectStatus | null;
  allowed: ProjectStatus[];
  context: TransitionContext;
  canOverride: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState<ProjectStatus | null>(null);
  const [reason, setReason] = useState("");
  const { settingFor } = useStatusSettings();

  function move(to: ProjectStatus, overrideReason?: string) {
    setResult(null);
    startTransition(async () => {
      const res = await transitionProject({ projectId, to, overrideReason });
      setResult(res);
      if (res.ok) {
        setConfirming(null);
        setReason("");
        router.refresh();
      }
    });
  }

  if (allowed.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-xs font-medium text-muted-foreground">Status</p>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-xs text-muted-foreground">Terminal — no further transitions</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Move to</p>
        <StatusBadge status={status} />
      </div>

      <div className="mt-3 space-y-2">
        {allowed.map((to) => {
          const check = checkTransition(status, to, context, heldFromStatus);
          const blocked = check.blockers.length > 0;
          const warned = check.warnings.length > 0;
          const meta = STATUS_META[to];

          return (
            <div key={to}>
              <button
                disabled={pending || blocked || (warned && !canOverride)}
                onClick={() => (warned ? setConfirming(confirming === to ? null : to) : move(to))}
                className="flex w-full items-center gap-2 rounded-[var(--radius)] border border-border-subtle px-3 py-2.5 text-left transition-colors enabled:hover:border-border-strong enabled:hover:bg-surface-muted disabled:opacity-55"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{settingFor(to)?.label ?? meta.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{meta.description}</span>
                </span>
                {blocked ? (
                  <Lock className="size-4 shrink-0 text-muted-foreground" />
                ) : warned ? (
                  <AlertTriangle className="size-4 shrink-0 text-[var(--tone-amber-fg)]" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>

              {blocked ? (
                <ul className="mt-1 space-y-0.5 pl-3">
                  {check.blockers.map((b) => (
                    <li key={b.requirement} className="text-xs text-muted-foreground">
                      · {b.requirement}
                    </li>
                  ))}
                </ul>
              ) : null}

              {confirming === to ? (
                <div className="mt-2 rounded-[var(--radius)] tone-amber p-3">
                  <p className="text-xs font-medium">Override required</p>
                  <ul className="mt-1 space-y-0.5">
                    {check.warnings.map((w) => (
                      <li key={w.requirement} className="text-xs">
                        · {w.requirement}
                      </li>
                    ))}
                  </ul>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for proceeding"
                    className="mt-2 h-9 w-full rounded-[var(--radius)] border border-border-strong bg-surface px-2 text-sm text-foreground"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={reason.trim().length < 3 || pending}
                      onClick={() => move(to, reason.trim())}
                    >
                      Confirm and move
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {result && !result.ok ? (
        <p className="mt-3 text-xs text-[var(--tone-rose-fg)]">{result.message}</p>
      ) : null}
      {result?.ok ? <p className="mt-3 text-xs text-[var(--tone-emerald-fg)]">{result.message}</p> : null}
    </Card>
  );
}
