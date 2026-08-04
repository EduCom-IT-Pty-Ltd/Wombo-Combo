import { SettingsHeader, SettingsNav } from "@/components/admin/settings-nav";

/**
 * Settings shell. The rail is desktop-only; on a phone the index page at
 * `/admin` is the menu and every section carries a back link to it.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <SettingsHeader />
      <div className="gap-6 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
