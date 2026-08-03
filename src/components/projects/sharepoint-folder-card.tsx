"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FolderSync, RefreshCw } from "lucide-react";
import { retrySharePointFolder } from "@/app/actions/sharepoint";
import { Button, Card, CardHeader } from "@/components/ui";

/**
 * The project's SharePoint folder, and a way to create it when the automatic
 * attempt did not.
 *
 * Provisioning is deliberately non-fatal at project creation, so a Graph outage
 * leaves a project with no folder. Without this, the only remedy would be to
 * recreate the project — which would burn a project number and lose whatever had
 * already been recorded against it.
 */
export function SharePointFolderCard({
  projectId,
  folderUrl,
  canRetry,
}: {
  projectId: string;
  folderUrl: string | null;
  canRetry: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <Card>
      <CardHeader
        title="SharePoint folder"
        description={folderUrl ? "Files for this project live here." : "This project has no folder yet."}
        action={
          folderUrl ? (
            <a
              href={folderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary"
            >
              Open in SharePoint <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null
        }
      />

      {folderUrl ? null : (
        <div className="space-y-3 px-4 py-3 sm:px-5">
          <p className="text-xs text-muted-foreground">
            Either it was created before folders were set up, or the attempt failed — the Activity tab records the
            reason. Creating it is safe to repeat; an existing folder is reused rather than duplicated.
          </p>

          {canRetry ? (
            <form
              action={() => start(async () => setResult(await retrySharePointFolder(projectId)))}
            >
              {/* min-h-11 keeps this a 44px target on a phone. */}
              <Button type="submit" variant="secondary" className="min-h-11" disabled={pending}>
                {pending ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <FolderSync className="size-4" aria-hidden />}
                {pending ? "Creating…" : "Create folder"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">Your role cannot create the folder.</p>
          )}

          {result ? (
            <p className={`text-xs ${result.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>
              {result.message}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
