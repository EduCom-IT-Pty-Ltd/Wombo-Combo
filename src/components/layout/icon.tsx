import {
  CalendarDays,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
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
  users: Users,
  receipt: Receipt,
  shield: ShieldCheck,
  settings: Settings,
  more: MoreHorizontal,
} as const satisfies Record<IconName, unknown>;

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Component = ICONS[name];
  return <Component className={className} strokeWidth={1.75} aria-hidden />;
}
