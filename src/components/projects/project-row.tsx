import Link from "next/link";
import { AlertTriangle, CheckSquare } from "lucide-react";
import { AvatarStack, Badge } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/lib/domain/money";
import type { Person, ProjectSummary } from "@/lib/data/types";
import { formatDateRange, formatRelative } from "@/lib/utils";

/**
 * One project in a list. Card-shaped on mobile, table-ish from `sm` — same
 * component either way, so there is one place to change what a project looks
 * like across the app.
 */
export function ProjectRow({
  project,
  people,
  showFinancials,
}: {
  project: ProjectSummary;
  people: Person[];
  showFinancials: boolean;
}) {
  const crew = people.filter((p) => project.assignedInstallerIds.includes(p.id));

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{project.projectNumber}</span>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{project.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {project.customerName}
            {project.siteLabel ? ` · ${project.siteLabel}` : ""}
          </p>
        </div>

        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <div className="flex items-center gap-2">
            {project.openTasks > 0 ? (
              <Badge tone="slate">
                <CheckSquare className="size-3" /> {project.openTasks}
              </Badge>
            ) : null}
            {project.openDefects > 0 ? (
              <Badge tone="rose">
                <AlertTriangle className="size-3" /> {project.openDefects}
              </Badge>
            ) : null}
            {crew.length > 0 ? <AvatarStack people={crew} /> : null}
          </div>

          <div className="text-right">
            {showFinancials && project.contractValueCents > 0 ? (
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(project.contractValueCents, "AUD", { compact: true })}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {project.scheduledStartAt
                ? formatDateRange(project.scheduledStartAt, project.scheduledEndAt)
                : `Updated ${formatRelative(project.updatedAt)}`}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
