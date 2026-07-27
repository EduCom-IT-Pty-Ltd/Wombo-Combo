"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ProjectTab } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Horizontally scrollable on mobile — nine tabs never fit a phone. */
export function ProjectTabs({ projectId, tabs }: { projectId: string; tabs: ProjectTab[] }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="-mx-4 overflow-x-auto border-b border-border-subtle px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = pathname === href;
          return (
            <li key={tab.segment || "overview"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-all duration-200",
                  active
                    ? "border-primary font-semibold text-primary drop-shadow-[0_2px_7px_rgb(49_95_231/0.28)]"
                    : "border-transparent text-muted-foreground hover:-translate-y-px hover:border-primary/30 hover:text-primary",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
