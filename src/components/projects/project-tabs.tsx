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
                  "block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
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
