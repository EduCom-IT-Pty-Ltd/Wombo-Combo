import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { NAV_ITEMS } from "@/lib/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/topbar";
import { StatusSettingsProvider } from "@/components/status-settings-provider";
import { readStatusSettings } from "@/lib/data/local-store";
import { PageTransition } from "@/components/layout/page-transition";

/**
 * The authenticated shell. Navigation is filtered by capability here rather than
 * inside each nav component, so a role that cannot open a module never sees it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const [items, statusSettings] = [NAV_ITEMS.filter((item) => can(session.role, item.capability)), await readStatusSettings()];

  const userName = [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") || session.user.email;
  const initials =
    [session.user.firstName?.[0], session.user.lastName?.[0]].filter(Boolean).join("").toUpperCase() ||
    session.user.email[0].toUpperCase();

  return (
    <StatusSettingsProvider settings={statusSettings}><div className="flex min-h-dvh">
      <Sidebar items={items} orgName={session.org.name} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          orgName={session.org.name}
          userName={userName}
          initials={initials}
          role={session.role}
          isDemo={session.isDemo}
        />

        {/* pb-20 clears the mobile bottom nav; lg drops it. */}
        <main className="flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pb-8">
          <PageTransition><div className="mx-auto w-full max-w-6xl">{children}</div></PageTransition>
        </main>
      </div>

      <BottomNav items={items} />
    </div></StatusSettingsProvider>
  );
}
