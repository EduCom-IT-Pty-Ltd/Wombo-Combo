"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { RiveThemeSwitch } from "./rive-theme-switch";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "enviroshield-theme";

/** Status bar tint on mobile, so the browser chrome matches the surface. */
const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#14171d" };

/**
 * Applied to `<html>` before first paint by `ThemeScript`, and again by the
 * toggle. Kept in one place so both agree on the attribute and the storage key.
 */
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  listeners.forEach((listener) => listener());
}

/**
 * `<html data-theme>` is the source of truth, so the toggle reads the same value
 * the no-flash script wrote rather than keeping a second copy in React state.
 * The `storage` event keeps a second tab in step.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) applyTheme(event.newValue === "dark" ? "dark" : "light");
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Light on the server; `useSyncExternalStore` re-reads the DOM after hydration. */
const getServerSnapshot = (): Theme => "light";

/**
 * Runs synchronously in `<head>` so a dark-mode user never sees a white flash.
 * Light is the default: an unset preference stays light regardless of what the
 * operating system is set to.
 *
 * The `<meta name="theme-color">` tag is written by Next after this script runs,
 * so the status-bar tint is applied once the document is parsed rather than here.
 */
export function ThemeScript() {
  const source = [
    "(function(){var t=\"light\";",
    `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark")t="dark";}catch(e){}`,
    "document.documentElement.dataset.theme=t;",
    `var c=t==="dark"?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)};`,
    'function s(){var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.setAttribute("content",c);}',
    'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",s);else s();})();',
  ].join("");
  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing or a storage quota — the theme still applies for this page.
    }
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      // 44px-high tap target: show a compact pull-tab on phones, then use a
      // wide desktop control comparable to the adjacent account controls.
      className={cn(
        "grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] text-muted-foreground transition-transform duration-150 hover:scale-[1.02] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] sm:w-52",
        className,
      )}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
    >
      <RiveThemeSwitch dark={dark} />
    </button>
  );
}
