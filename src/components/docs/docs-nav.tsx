"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, Compass, Search, Wrench, Workflow } from "lucide-react";
import type { DocIconName, DocSearchEntry } from "@/lib/docs";
import { cn } from "@/lib/utils";

export interface DocsNavCategory {
  id: string;
  title: string;
  icon: DocIconName;
  guides: Array<{ slug: string; title: string }>;
}

const CATEGORY_ICONS = {
  compass: Compass,
  workflow: Workflow,
  tools: Wrench,
  book: BookOpen,
} as const satisfies Record<DocIconName, unknown>;

/**
 * The docs index, as a sidebar on a laptop and a disclosure on a phone. Search
 * replaces the list rather than sitting beside it — on a 375px screen there is
 * only room for one of them, and a filtered list is the more useful one.
 */
export function DocsNav({ categories, index }: { categories: DocsNavCategory[]; index: DocSearchEntry[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return null;
    return index.filter((entry) => terms.every((term) => entry.haystack.includes(term)));
  }, [index, query]);

  const activeSlug = pathname.startsWith("/docs/") ? pathname.slice("/docs/".length) : null;
  const activeTitle = index.find((entry) => entry.slug === activeSlug)?.title ?? "All guides";

  const panel = (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the guides"
          aria-label="Search the guides"
          // 16px so iOS does not zoom the page when it takes focus.
          className="h-11 w-full rounded-[var(--radius)] border border-border-subtle bg-surface pr-3 pl-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none sm:text-sm"
        />
      </div>

      {matches ? (
        matches.length ? (
          <ul className="space-y-0.5">
            {matches.map((entry) => (
              <li key={entry.slug}>
                <NavLink href={`/docs/${entry.slug}`} active={entry.slug === activeSlug} onNavigate={() => setOpen(false)}>
                  <span className="block truncate">{entry.title}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{entry.category}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No guide mentions “{query}”.
          </p>
        )
      ) : (
        <nav aria-label="Guides" className="space-y-4">
          {categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.icon];
            return (
              <div key={category.id}>
                <p className="flex items-center gap-2 px-3 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Icon className="size-3.5" aria-hidden /> {category.title}
                </p>
                <ul className="space-y-0.5">
                  {category.guides.map((guide) => (
                    <li key={guide.slug}>
                      <NavLink
                        href={`/docs/${guide.slug}`}
                        active={guide.slug === activeSlug}
                        onNavigate={() => setOpen(false)}
                      >
                        {guide.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );

  return (
    <>
      {/* Phone and tablet: one 44px control that opens the whole index. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-border-subtle bg-surface px-4 text-sm font-semibold text-foreground"
        >
          <span className="min-w-0 truncate">{activeTitle}</span>
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {open ? <div className="mt-3 rounded-[var(--radius)] border border-border-subtle bg-surface p-3">{panel}</div> : null}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20">{panel}</div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  active,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center rounded-[var(--radius)] px-3 py-2 text-sm transition-colors lg:min-h-0",
        active
          ? "bg-primary-muted font-semibold text-primary"
          : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <span className="min-w-0">{children}</span>
    </Link>
  );
}
