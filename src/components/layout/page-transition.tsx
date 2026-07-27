"use client";

import { usePathname } from "next/navigation";

/** Replays a small entrance transition after navigating between app pages/tabs. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Project tabs have their own, narrower transition so the workflow header
  // remains stationary while only the tab content changes.
  const isProjectWorkspace = /^\/projects\/[^/]+(?:\/.*)?$/.test(pathname) && pathname !== "/projects/new";
  return <div key={isProjectWorkspace ? "project-workspace" : pathname} className={isProjectWorkspace ? undefined : "motion-safe:animate-[page-in_300ms_cubic-bezier(0.2,0.8,0.2,1)_both]"}>{children}</div>;
}
