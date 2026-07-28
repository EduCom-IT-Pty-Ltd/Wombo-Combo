"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Package, PencilLine, TriangleAlert, X } from "lucide-react";
import { addSiteNote, logMaterialUse, raiseVariation } from "@/app/actions/field";
import { Button } from "@/components/ui";
import type { ActionResult } from "@/app/actions/projects";

type Sheet = "materials" | "note" | "variation";

const UNITS = ["ea", "lm", "sqm", "hrs", "kg", "box"];

/**
 * The crew's logging surface. Everything is one tap from the job card and one
 * short form deep — nothing here asks for a price, a code, or a decision the
 * office should be making.
 */
export function LogActions({ projectId }: { projectId: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Tile onClick={() => setSheet("materials")} icon={<Package className="size-6" />} label="Materials" />
        <Tile onClick={() => setSheet("note")} icon={<PencilLine className="size-6" />} label="Site note" />
        <Tile onClick={() => setSheet("variation")} icon={<TriangleAlert className="size-6" />} label="Extra work" />
        <Tile href={`/projects/${projectId}/documents`} icon={<FileText className="size-6" />} label="Docs" />
      </div>

      {sheet === "materials" ? (
        <Sheet title="What did you use?" onClose={() => setSheet(null)}>
          <MaterialsForm projectId={projectId} onDone={() => setSheet(null)} />
        </Sheet>
      ) : null}
      {sheet === "note" ? (
        <Sheet title="Add a site note" onClose={() => setSheet(null)}>
          <NoteForm projectId={projectId} onDone={() => setSheet(null)} />
        </Sheet>
      ) : null}
      {sheet === "variation" ? (
        <Sheet title="Extra work on site" onClose={() => setSheet(null)}>
          <VariationForm projectId={projectId} onDone={() => setSheet(null)} />
        </Sheet>
      ) : null}
    </>
  );
}

function Tile({
  icon,
  label,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  // 5rem tall: comfortably hit with a gloved thumb without looking at the screen.
  const className =
    "flex h-20 flex-col items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border-strong bg-surface text-sm font-semibold text-foreground active:bg-surface-muted";
  if (href) {
    return (
      <Link href={href} className={className}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}

/** Bottom sheet on a phone, centred card from `sm`. */
function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-40 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border-strong bg-surface p-4 pb-safe shadow-2xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-[var(--radius)] text-muted-foreground active:bg-surface-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
        <div className="h-4" />
      </div>
    </>
  );
}

/** 16px minimum, or iOS zooms the viewport the moment it takes focus. */
const fieldClass =
  "h-14 w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground";

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(run: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.ok) {
        router.refresh();
        onDone();
      } else setError(result.message);
    });
  }

  return { pending, error, submit };
}

function MaterialsForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const { pending, error, submit } = useSubmit(onDone);

  return (
    <div className="space-y-3">
      <Label text="Item">
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="e.g. Acoustic sealant"
          className={fieldClass}
          autoFocus
        />
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Label text="How much">
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0"
            className={fieldClass}
          />
        </Label>
        <Label text="Unit">
          <select value={unit} onChange={(event) => setUnit(event.target.value)} className={fieldClass}>
            {UNITS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <Submit
        pending={pending}
        error={error}
        disabled={description.trim().length < 2 || !(Number(quantity) > 0)}
        onClick={() => submit(() => logMaterialUse({ projectId, description, quantity: Number(quantity), unit }))}
      >
        Record materials
      </Submit>
    </div>
  );
}

function NoteForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { pending, error, submit } = useSubmit(onDone);

  return (
    <div className="space-y-3">
      <Label text="Note">
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          placeholder="What happened on site?"
          className="w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 py-3 text-base text-foreground placeholder:text-muted-foreground"
          autoFocus
        />
      </Label>
      <Submit
        pending={pending}
        error={error}
        disabled={note.trim().length < 2}
        onClick={() => submit(() => addSiteNote({ projectId, note }))}
      >
        Add note
      </Submit>
    </div>
  );
}

function VariationForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const { pending, error, submit } = useSubmit(onDone);

  return (
    <div className="space-y-3">
      <Label text="What is the extra work?">
        <textarea
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          rows={3}
          placeholder="e.g. Extra power outlets asked for in bay 14"
          className="w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 py-3 text-base text-foreground placeholder:text-muted-foreground"
          autoFocus
        />
      </Label>
      <p className="text-sm text-muted-foreground">
        The office prices this and sends it to the customer. Don&apos;t start it until they say so.
      </p>
      <Submit
        pending={pending}
        error={error}
        disabled={title.trim().length < 4}
        onClick={() => submit(() => raiseVariation({ projectId, title }))}
      >
        Send to the office
      </Submit>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted-foreground">{text}</span>
      {children}
    </label>
  );
}

function Submit({
  pending,
  error,
  disabled,
  onClick,
  children,
}: {
  pending: boolean;
  error: string | null;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <Button size="lg" variant="primary" className="w-full" disabled={pending || disabled} onClick={onClick}>
        {pending ? "Saving…" : children}
      </Button>
      {error ? <p className="text-sm font-semibold text-[var(--tone-rose-fg)]">{error}</p> : null}
    </>
  );
}
