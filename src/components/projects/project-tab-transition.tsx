"use client";

import { usePathname } from "next/navigation";

/** Animates only the changing workspace panel, never the project workflow UI. */
export function ProjectTabTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="motion-safe:animate-[tab-content-in_420ms_cubic-bezier(0.2,0.8,0.2,1)_both]">{children}</div>;
}
