import { Badge } from "@/components/ui";
import { PIPELINE_ORDER, STATUS_META, type ProjectStatus } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

/**
 * Compact pipeline stepper for the project header. Shows position without
 * listing all thirteen stages — on mobile there is no room, and on desktop the
 * full list is noise once you know where you are.
 */
export function StatusStepper({ status }: { status: ProjectStatus }) {
  const index = PIPELINE_ORDER.indexOf(status);
  const offPipeline = index === -1;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-1 items-center gap-0.5" aria-hidden>
        {PIPELINE_ORDER.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              offPipeline
                ? "bg-surface-muted"
                : i < index
                  ? "bg-primary/40"
                  : i === index
                    ? "bg-primary"
                    : "bg-surface-muted",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {offPipeline ? STATUS_META[status].label : `${index + 1}/${PIPELINE_ORDER.length}`}
      </span>
    </div>
  );
}
