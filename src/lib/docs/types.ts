/**
 * The docs site is content-as-data rather than MDX: no build step, no extra
 * dependency, and every guide is searchable and linkable without parsing files
 * at request time.
 *
 * Body strings support three pieces of inline markup, rendered by
 * `src/components/docs/prose.tsx`: `**bold**`, `` `code` `` and
 * `[label](/href)`. Nothing else — the point is guidance, not a CMS.
 */

export type DocBlock =
  | { kind: "text"; body: string }
  /** Numbered, for anything the reader is meant to do in order. */
  | { kind: "steps"; items: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "callout"; tone: "info" | "warning" | "tip"; title: string; body: string }
  /** Wide tables scroll inside their own container — never the page. */
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "definitions"; items: Array<{ term: string; body: string }> };

export interface DocSection {
  /** Anchor id. Also drives the "On this page" list. */
  id: string;
  heading: string;
  blocks: DocBlock[];
}

export interface DocGuide {
  slug: string;
  title: string;
  /** One sentence, shown on the index card and under the title. */
  summary: string;
  /** Roles this guide is written for, shown as chips and matched by search. */
  audience: string[];
  /** The part of the app the guide describes, linked from the guide header. */
  appHref?: string;
  appLabel?: string;
  sections: DocSection[];
}

export type DocIconName = "compass" | "workflow" | "tools" | "book";

export interface DocCategory {
  id: string;
  title: string;
  description: string;
  icon: DocIconName;
  guides: DocGuide[];
}
