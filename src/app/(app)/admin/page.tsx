import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SETTINGS_SECTIONS } from "@/lib/nav";
import { SettingsIcon } from "@/components/admin/settings-nav";

export const metadata = { title: "Settings" };

export default function SettingsIndexPage() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {SETTINGS_SECTIONS.map((section) => (
        <li key={section.segment}>
          <Link
            href={`/admin/${section.segment}`}
            className="ui-card-pop flex h-full min-h-20 items-center gap-3 rounded-[var(--radius)] border border-border-subtle bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius)] bg-primary/10 text-primary">
              <SettingsIcon name={section.icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{section.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{section.description}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
