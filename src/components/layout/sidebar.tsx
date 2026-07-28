"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./icon";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop-only rail. Mobile navigation lives in `bottom-nav.tsx`. */
export function Sidebar({ items, orgName, logoUrl }: { items: NavItem[]; orgName: string; logoUrl?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="neumorphic-shell hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface/95 shadow-[8px_0_30px_rgb(15_23_42/0.025)] backdrop-blur lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
        {logoUrl ? <Image src={logoUrl} alt="" width={28} height={28} className="size-7 rounded-lg object-contain" /> : <span className="grid size-7 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-[0_4px_12px_rgb(49_95_231/0.28)]">WC</span>}
        <span className="truncate text-sm font-semibold">{orgName}</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-all duration-150",
                    active
                      ? "neumorphic-nav-active font-semibold text-primary shadow-sm"
                      : "neumorphic-nav-item text-muted-foreground hover:translate-x-0.5 hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  <NavIcon name={item.icon} className="size-4.5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
