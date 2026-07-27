"use client";

import { usePathname } from "next/navigation";

/** Replays a small entrance transition after navigating between app pages/tabs. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="motion-safe:animate-[page-in_300ms_cubic-bezier(0.2,0.8,0.2,1)_both]">{children}</div>;
}
