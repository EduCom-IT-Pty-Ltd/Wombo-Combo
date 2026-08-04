import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { DOC_GUIDES, categoryOf, guideBySlug, neighbours } from "@/lib/docs";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { Block } from "@/components/docs/prose";

export function generateStaticParams() {
  return DOC_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  return guide ? { title: guide.title, description: guide.summary } : { title: "Guide" };
}

export default async function DocGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const category = categoryOf(slug);
  const { previous, next } = neighbours(slug);

  return (
    <article className="space-y-6">
      <header className="space-y-3">
        {category ? <p className="text-xs font-semibold tracking-wide text-primary uppercase">{category.title}</p> : null}
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{guide.title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{guide.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          {guide.audience.map((audience) => (
            <Badge key={audience}>{audience}</Badge>
          ))}
          {guide.appHref ? (
            <ButtonLink href={guide.appHref} size="sm" variant="secondary">
              Open {guide.appLabel ?? "in the app"}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </ButtonLink>
          ) : null}
        </div>
      </header>

      {/* Long guides need a way in. Two sections is a list nobody reads. */}
      {guide.sections.length > 2 ? (
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
          <ul className="mt-2 space-y-1">
            {guide.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex min-h-9 items-center text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="space-y-8">
        {guide.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-20 space-y-3">
            <h2 className="border-b border-border-subtle pb-2 text-base font-semibold text-foreground">
              {section.heading}
            </h2>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
      </div>

      <nav className="grid gap-3 border-t border-border-subtle pt-5 sm:grid-cols-2" aria-label="More guides">
        {previous ? (
          <Link
            href={`/docs/${previous.slug}`}
            className="flex min-h-16 flex-col justify-center rounded-[var(--radius)] border border-border-subtle bg-surface px-4 py-3 transition-colors hover:border-primary/40"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowLeft className="size-3.5" aria-hidden /> Previous
            </span>
            <span className="mt-0.5 text-sm font-semibold text-foreground">{previous.title}</span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next ? (
          <Link
            href={`/docs/${next.slug}`}
            className="flex min-h-16 flex-col justify-center rounded-[var(--radius)] border border-border-subtle bg-surface px-4 py-3 text-right transition-colors hover:border-primary/40 sm:items-end"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Next <ArrowRight className="size-3.5" aria-hidden />
            </span>
            <span className="mt-0.5 text-sm font-semibold text-foreground">{next.title}</span>
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
