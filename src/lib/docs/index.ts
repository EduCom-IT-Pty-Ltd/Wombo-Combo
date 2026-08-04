import { START_GUIDES } from "./guides/start";
import { DAILY_GUIDES } from "./guides/daily";
import { ADMIN_GUIDES } from "./guides/admin";
import { REFERENCE_GUIDES } from "./guides/reference";
import type { DocCategory, DocGuide } from "./types";

export type { DocBlock, DocCategory, DocGuide, DocIconName, DocSection } from "./types";

export const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "start",
    title: "Start here",
    description: "What the portal is for, how to move around it, and who can see what.",
    icon: "compass",
    guides: START_GUIDES,
  },
  {
    id: "daily",
    title: "Running a job",
    description: "Request to invoice, in the order the work actually happens.",
    icon: "workflow",
    guides: DAILY_GUIDES,
  },
  {
    id: "admin",
    title: "Set-up and admin",
    description: "The catalogues, the team and the settings everything else is built on.",
    icon: "tools",
    guides: ADMIN_GUIDES,
  },
  {
    id: "reference",
    title: "Reference",
    description: "What the portal does on its own, and what to do when something looks wrong.",
    icon: "book",
    guides: REFERENCE_GUIDES,
  },
];

/** Flat reading order, which is also the order prev/next follows. */
export const DOC_GUIDES: DocGuide[] = DOC_CATEGORIES.flatMap((category) => category.guides);

export function guideBySlug(slug: string): DocGuide | undefined {
  return DOC_GUIDES.find((guide) => guide.slug === slug);
}

export function categoryOf(slug: string): DocCategory | undefined {
  return DOC_CATEGORIES.find((category) => category.guides.some((guide) => guide.slug === slug));
}

export function neighbours(slug: string): { previous?: DocGuide; next?: DocGuide } {
  const index = DOC_GUIDES.findIndex((guide) => guide.slug === slug);
  if (index === -1) return {};
  return { previous: DOC_GUIDES[index - 1], next: DOC_GUIDES[index + 1] };
}

export interface DocSearchEntry {
  slug: string;
  title: string;
  summary: string;
  category: string;
  /** Section headings, so a search can land on the right part of a long guide. */
  headings: string[];
  /** Everything the guide says, lowercased once so search does not redo it per keystroke. */
  haystack: string;
}

/**
 * Built once at module load and handed to the client search as plain data —
 * the alternative is shipping every guide's blocks to the browser to re-flatten
 * them on each keystroke.
 */
export const DOC_SEARCH_INDEX: DocSearchEntry[] = DOC_CATEGORIES.flatMap((category) =>
  category.guides.map((guide) => ({
    slug: guide.slug,
    title: guide.title,
    summary: guide.summary,
    category: category.title,
    headings: guide.sections.map((section) => section.heading),
    haystack: [
      guide.title,
      guide.summary,
      category.title,
      ...guide.audience,
      ...guide.sections.flatMap((section) => [section.heading, ...section.blocks.flatMap(blockText)]),
    ]
      .join(" ")
      .toLowerCase(),
  })),
);

function blockText(block: DocGuide["sections"][number]["blocks"][number]): string[] {
  switch (block.kind) {
    case "text":
      return [block.body];
    case "steps":
    case "bullets":
      return block.items;
    case "callout":
      return [block.title, block.body];
    case "table":
      return [...block.columns, ...block.rows.flat()];
    case "definitions":
      return block.items.flatMap((item) => [item.term, item.body]);
  }
}
