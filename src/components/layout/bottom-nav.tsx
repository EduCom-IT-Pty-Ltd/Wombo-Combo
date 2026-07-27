"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./icon";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Mobile navigation. Four primary destinations plus a "More" sheet — the field
 * crew's two taps (My Day, then a job) should never need a menu.
 *
 * Which four depends on the role: an installer gets My Day first, office staff
 * get the dashboard.
 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = items
    .filter((i) => i.mobileOrder !== undefined)
    .sort((a, b) => a.mobileOrder! - b.mobileOrder!)
    .slice(0, 4);
  const overflow = items.filter((i) => !primary.includes(i));

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border-subtle bg-surface p-2 pb-safe">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong" />
            <ul>
              {overflow.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-[var(--radius)] px-3 py-3.5 text-sm text-foreground hover:bg-surface-muted"
                  >
                    <NavIcon name={item.icon} className="size-5 text-muted-foreground" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 pb-safe shadow-[0_-8px_24px_rgb(15_23_42/0.06)] backdrop-blur lg:hidden">
        {/* Column count tracks the visible items — a role with fewer primary
            destinations should still fill the bar rather than leave a gap. */}
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${primary.length + (overflow.length ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
                    active ? "font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  <NavIcon name={item.icon} className="size-5" />
                  {item.shortLabel ?? item.label}
                </Link>
              </li>
            );
          })}
          <li className={overflow.length ? undefined : "hidden"}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={cn(
                "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]",
                moreOpen ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <NavIcon name="more" className="size-5" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
