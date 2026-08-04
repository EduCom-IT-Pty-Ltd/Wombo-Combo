"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";
import { uploadDocument, type DocumentUploadState } from "@/app/actions/documents";
import { Button } from "@/components/ui";
import { DOCUMENT_KIND_LABELS, DOCUMENT_KIND_OPTIONS, MAX_DOCUMENT_BYTES } from "@/lib/domain/documents";

const initial: DocumentUploadState = { ok: false };
// h-11 and text-base throughout: 44px targets, and iOS zooms the page on any
// input under 16px.
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground sm:text-sm";

export function DocumentUpload({ projectId, hasFolder }: { projectId: string; hasFolder: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="size-4" aria-hidden /> Upload
      </Button>
      {open ? <UploadModal projectId={projectId} hasFolder={hasFolder} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function UploadModal({
  projectId,
  hasFolder,
  onClose,
}: {
  projectId: string;
  hasFolder: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(uploadDocument, initial);
  const [file, setFile] = useState<{ name: string; tooBig: boolean } | null>(null);
  const closed = useRef(false);

  // Close on success rather than leaving the dialog over the list the upload
  // just changed. The guard is because `state` survives re-renders, so without
  // it reopening the dialog would close it again immediately.
  useEffect(() => {
    if (state.ok && !closed.current) {
      closed.current = true;
      onClose();
    }
  }, [state.ok, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Upload a document"
    >
      <form
        action={action}
        className="pb-safe flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-border-strong bg-surface shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 className="text-base font-bold">Upload a document</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Filed into the project&rsquo;s SharePoint folder by kind.
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <input type="hidden" name="projectId" value={projectId} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">File</span>
            <span className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-muted px-3 text-sm font-semibold hover:border-primary hover:text-primary">
              <Upload className="size-4" aria-hidden />
              <span className="truncate">{file?.name ?? "Choose a file"}</span>
              <input
                required
                name="file"
                type="file"
                className="sr-only"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  // Checked here as well as on the server: over the body limit
                  // the request never reaches the action, and what the framework
                  // reports instead does not tell anyone what went wrong.
                  setFile(chosen ? { name: chosen.name, tooBig: chosen.size > MAX_DOCUMENT_BYTES } : null);
                }}
              />
            </span>
            <span
              className={`mt-1 block text-xs ${file?.tooBig ? "text-[var(--tone-rose-fg)]" : "text-muted-foreground"}`}
            >
              {file?.tooBig
                ? "That file is over 4 MB — add it through the SharePoint folder link instead."
                : "Up to 4 MB. Anything larger goes straight into the SharePoint folder."}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Kind</span>
            <select required name="kind" defaultValue="drawing" className={inputClass}>
              {DOCUMENT_KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {DOCUMENT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="requiresAcknowledgement" className="size-5 accent-[var(--primary)]" />
            <span className="text-sm">
              Sign-on required
              <span className="block text-xs text-muted-foreground">
                Installers acknowledge this before clocking on.
              </span>
            </span>
          </label>

          {!hasFolder ? (
            <p className="text-xs text-[var(--tone-amber-fg)]">
              This project has no SharePoint folder yet. Create it from the card above first.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-4">
          <Button type="submit" variant="primary" className="min-h-11" disabled={pending || !hasFolder || file?.tooBig}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {state.message && !state.ok ? (
            <p className="w-full text-xs text-[var(--tone-rose-fg)]">{state.message}</p>
          ) : null}
        </div>
      </form>
    </div>,
    document.body,
  );
}
