"use client";

import { type ProjectStatus } from "@/lib/domain/status";
import { useStatusSettings } from "@/components/status-settings-provider";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const { settingFor } = useStatusSettings();
  const setting = settingFor(status);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap text-white", className)} style={{ backgroundColor: setting?.color }}>
      {setting?.label ?? status.replaceAll("_", " ")}
    </span>
  );
}

/**
 * Compact pipeline stepper for the project header. Shows position without
 * listing all thirteen stages — on mobile there is no room, and on desktop the
 * full list is noise once you know where you are.
 */
export function StatusStepper({ status }: { status: ProjectStatus }) {
  const { flow, settingFor } = useStatusSettings();
  const index = flow.findIndex((setting) => setting.status === status);
  const offPipeline = index === -1;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-1 items-center gap-0.5" aria-hidden>
        {flow.map((setting, i) => (
          <span
            key={setting.status}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              offPipeline
                ? "bg-surface-muted"
                : i <= index ? "opacity-100" : "bg-surface-muted",
            )}
            style={!offPipeline && i <= index ? { backgroundColor: setting.color } : undefined}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {offPipeline ? settingFor(status)?.label ?? status.replaceAll("_", " ") : `${index + 1}/${flow.length}`}
      </span>
    </div>
  );
}
