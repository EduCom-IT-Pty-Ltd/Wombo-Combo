import {
  BookOpen,
  CalendarDays,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
  Boxes,
  Factory,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { IconName } from "@/lib/nav";

const ICONS = {
  home: LayoutDashboard,
  folder: FolderKanban,
  calendar: CalendarDays,
  hardhat: HardHat,
  labour: HardHat,
  users: Users,
  receipt: Receipt,
  materials: Boxes,
  production: Factory,
  shield: ShieldCheck,
  settings: Settings,
  book: BookOpen,
  more: MoreHorizontal,
} as const satisfies Record<IconName, unknown>;

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Component = ICONS[name];
  return <Component className={className} strokeWidth={1.75} aria-hidden />;
}
