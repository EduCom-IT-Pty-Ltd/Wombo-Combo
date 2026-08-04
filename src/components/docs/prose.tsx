import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import type { DocBlock } from "@/lib/docs";
import { cn } from "@/lib/utils";

/**
 * Renders the docs content model. Four pieces of inline markup are supported —
 * `**bold**`, `*italic*`, `` `code` `` and `[label](/href)` — and nothing else,
 * so a guide cannot quietly become a page of hand-written markup nobody styles.
 *
 * Bold is first in the alternation so `**bold**` is never read as an italic
 * wrapping a stray asterisk, and italic requires a non-space after the opening
 * `*` so a lone asterisk mid-sentence stays a lone asterisk.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

export function Inline({ body }: { body: string }): ReactNode {
  return body.split(INLINE).map((token, index) => {
    const key = `${index}-${token}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    }

    if (token.startsWith("*") && token.endsWith("*")) {
      return (
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
          {token.slice(1, -1)}
        </code>
      );
    }

    const link = LINK.exec(token);
    if (link) {
      const [, label, href] = link;
      // An absolute href leaves the app, so it opens in a new tab and is never
      // told which page sent it.
      return href.startsWith("http") ? (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:no-underline"
        >
          {label}
        </a>
      ) : (
        <Link key={key} href={href} className="font-medium text-primary underline underline-offset-2 hover:no-underline">
          {label}
        </Link>
      );
    }

    return <Fragment key={key}>{token}</Fragment>;
  });
}

const CALLOUTS = {
  info: { icon: Info, tone: "tone-blue", ring: "ring-[color-mix(in_srgb,var(--tone-blue-fg)_22%,transparent)]" },
  warning: { icon: TriangleAlert, tone: "tone-amber", ring: "ring-[color-mix(in_srgb,var(--tone-amber-fg)_22%,transparent)]" },
  tip: { icon: Lightbulb, tone: "tone-emerald", ring: "ring-[color-mix(in_srgb,var(--tone-emerald-fg)_22%,transparent)]" },
} as const;

export function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          <Inline body={block.body} />
        </p>
      );

    case "steps":
      return (
        <ol className="space-y-2.5">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-muted text-[11px] font-bold text-primary tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0">
                <Inline body={item} />
              </span>
            </li>
          ))}
        </ol>
      );

    case "bullets":
      return (
        <ul className="space-y-2">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden />
              <span className="min-w-0">
                <Inline body={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "callout": {
      const { icon: Icon, tone, ring } = CALLOUTS[block.tone];
      return (
        <div className={cn("flex gap-3 rounded-[var(--radius)] p-3.5 ring-1 ring-inset", tone, ring)}>
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">{block.title}</p>
            <p className="text-sm leading-relaxed opacity-90">
              <Inline body={block.body} />
            </p>
          </div>
        </div>
      );
    }

    case "table":
      // Scrolls inside its own container so the page itself never scrolls
      // sideways on a phone.
      return (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-border-subtle">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-muted">
                {block.columns.map((column) => (
                  <th key={column} className="px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {block.rows.map((row, index) => (
                <tr key={index} className="align-top">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn(
                        "px-3.5 py-2.5 leading-relaxed",
                        cellIndex === 0 ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Inline body={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "definitions":
      return (
        <dl className="divide-y divide-border-subtle rounded-[var(--radius)] border border-border-subtle">
          {block.items.map((item) => (
            <div key={item.term} className="px-3.5 py-3">
              <dt className="text-sm font-semibold text-foreground">
                <Inline body={item.term} />
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                <Inline body={item.body} />
              </dd>
            </div>
          ))}
        </dl>
      );
  }
}
