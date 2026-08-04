import Link from "next/link";
import { ArrowRight, BookOpen, Compass, HardHat, Receipt, Workflow, Wrench } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { isFieldOnly } from "@/lib/domain/permissions";
import { DOC_CATEGORIES, type DocIconName } from "@/lib/docs";
import { Card, CardHeader, PageHeader } from "@/components/ui";

export const metadata = { title: "Guides" };

const CATEGORY_ICONS = {
  compass: Compass,
  workflow: Workflow,
  tools: Wrench,
  book: BookOpen,
} as const satisfies Record<DocIconName, unknown>;

export default async function DocsIndexPage() {
  const session = await getSession();
  // Field crew get one recommendation rather than a menu — their whole job is
  // one screen, and a list of eighteen guides is not help.
  const fieldOnly = isFieldOnly(session.role, session.permissionOverrides);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Guides"
        description="How to use the portal, from a new request through to a paid invoice."
      />

      {fieldOnly ? (
        <StartCard
          href="/docs/field-work"
          icon={<HardHat className="size-5" />}
          title="Working on site"
          description="Check in, log what you used, check out. This is the one to read."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StartCard
            href="/docs/getting-started"
            icon={<Compass className="size-5" />}
            title="New here?"
            description="What the portal does and where to start in your role."
          />
          <StartCard
            href="/docs/project-lifecycle"
            icon={<Workflow className="size-5" />}
            title="The workflow"
            description="Every stage a job passes through, and what unlocks each one."
          />
          <StartCard
            href="/docs/troubleshooting"
            icon={<Receipt className="size-5" />}
            title="Something looks wrong"
            description="The questions people ask most, and what to do about each."
          />
        </div>
      )}

      {DOC_CATEGORIES.map((category) => {
        const Icon = CATEGORY_ICONS[category.icon];
        return (
          <Card key={category.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden />
                  {category.title}
                </span>
              }
              description={category.description}
            />
            <ul className="divide-y divide-border-subtle">
              {category.guides.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/docs/${guide.slug}`}
                    className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{guide.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {guide.summary}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function StartCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="ui-card-pop flex min-h-20 flex-col gap-1.5 rounded-[var(--radius)] border border-border-subtle bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="grid size-9 place-items-center rounded-[var(--radius)] bg-primary/10 text-primary">{icon}</span>
      <span className="mt-1 text-sm font-semibold text-foreground">{title}</span>
      <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
    </Link>
  );
}
