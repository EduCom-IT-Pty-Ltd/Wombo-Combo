import Link from "next/link";
import { BookOpen } from "lucide-react";
import { DOC_CATEGORIES, DOC_SEARCH_INDEX } from "@/lib/docs";
import { DocsNav } from "@/components/docs/docs-nav";

export const metadata = {
  title: { default: "Guides", template: "%s · Guides" },
};

/**
 * The docs shell. It sits inside the authenticated app rather than beside it so
 * a guide is always one tap from the screen it describes — and so the examples
 * use the same words as the navigation the reader is looking at.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const categories = DOC_CATEGORIES.map(({ id, title, icon, guides }) => ({
    id,
    title,
    icon,
    guides: guides.map(({ slug, title: guideTitle }) => ({ slug, title: guideTitle })),
  }));

  return (
    <div className="space-y-5">
      <Link href="/docs" className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-primary-muted text-primary">
          <BookOpen className="size-4" aria-hidden />
        </span>
        Guides
      </Link>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <DocsNav categories={categories} index={DOC_SEARCH_INDEX} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
