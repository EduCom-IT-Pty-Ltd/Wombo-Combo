import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" });
const dateYearFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("en-AU", { weekday: "short" });

export function formatDate(value: string | Date | null | undefined, withYear = false): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return (withYear ? dateYearFmt : dateFmt).format(d);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return timeFmt.format(d).toLowerCase().replace(" ", "");
}

export function formatWeekday(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return weekdayFmt.format(d);
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Not scheduled";
  if (!end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** "2 days ago" / "in 3 days" — relative wording the whole app shares. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (Math.abs(diffMs) < 3_600_000) {
    const mins = Math.round(diffMs / 60_000);
    if (Math.abs(mins) < 2) return "just now";
    return mins < 0 ? `${-mins}m ago` : `in ${mins}m`;
  }
  if (Math.abs(diffDays) < 1) {
    const hours = Math.round(diffMs / 3_600_000);
    return hours < 0 ? `${-hours}h ago` : `in ${hours}h`;
  }
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return diffDays < 0 ? `${-diffDays}d ago` : `in ${diffDays}d`;
}

export function isOverdue(value: string | null | undefined): boolean {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
