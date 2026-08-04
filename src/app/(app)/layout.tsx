import { fieldUserId, getSession } from "@/lib/auth/session";
import { navItemsFor } from "@/lib/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/topbar";
import { StatusSettingsProvider } from "@/components/status-settings-provider";
import { PageTransition } from "@/components/layout/page-transition";
import { SiteFooter } from "@/components/layout/site-footer";
import { getOpenTimeEntry, getProject, getStatusSettings, listPeople, listSearchIndex } from "@/lib/data/repository";
import { can } from "@/lib/domain/permissions";

/**
 * The authenticated shell. Navigation is filtered by capability here rather than
 * inside each nav component, so a role that cannot open a module never sees it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // `people` is only used to populate the demo user switcher, so a real session
  // does not pay for the query at all.
  const [statusSettings, openEntry, people, search] = await Promise.all([
    getStatusSettings(session.org.id),
    getOpenTimeEntry(session.org.id, fieldUserId(session)),
    session.isDemo ? listPeople(session.org.id) : Promise.resolve([]),
    listSearchIndex(session.org.id, can(session.role, "customer.view", session.permissionOverrides)),
  ]);
  const activeProject = openEntry ? await getProject(session.org.id, openEntry.projectId) : null;
  const items = navItemsFor(session.role, session.permissionOverrides);

  const userName = [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") || session.user.email;
  const initials =
    [session.user.firstName?.[0], session.user.lastName?.[0]].filter(Boolean).join("").toUpperCase() ||
    session.user.email[0].toUpperCase();

  return (
    <StatusSettingsProvider settings={statusSettings}><div className="flex min-h-dvh">
      <Sidebar items={items} orgName={session.org.name} logoUrl={session.org.logoUrl} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          orgName={session.org.name}
          userName={userName}
          initials={initials}
          role={session.role}
          isDemo={session.isDemo}
          logoUrl={session.org.logoUrl}
          userId={session.user.id}
          demoPeople={session.isDemo ? people.map(({ id, name, role }) => ({ id, name, role })) : undefined}
          searchProjects={search.projects}
          searchCustomers={search.customers}
          activeShift={openEntry && activeProject ? { projectId: activeProject.id, projectTitle: activeProject.title, startedAt: openEntry.startedAt, paused: Boolean(openEntry.pausedAt) } : null}
        />

        <main className="flex-1 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
          <PageTransition><div className="mx-auto w-full max-w-6xl">{children}</div></PageTransition>
        </main>

        {/* The footer carries the clearance the fixed mobile bottom nav needs;
            lg drops both the nav and the padding. */}
        <SiteFooter withGuides className="pb-24 lg:pb-8" />
      </div>

      <BottomNav items={items} />
    </div></StatusSettingsProvider>
  );
}
