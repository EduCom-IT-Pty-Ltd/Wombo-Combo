import { fieldUserId, getSession } from "@/lib/auth/session";
import { navItemsFor } from "@/lib/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/topbar";
import { StatusSettingsProvider } from "@/components/status-settings-provider";
import { readStatusSettings } from "@/lib/data/local-store";
import { PageTransition } from "@/components/layout/page-transition";
import { getOpenTimeEntry, getProject, listCustomers, listPeople, listProjects } from "@/lib/data/repository";
import { can } from "@/lib/domain/permissions";

/**
 * The authenticated shell. Navigation is filtered by capability here rather than
 * inside each nav component, so a role that cannot open a module never sees it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const [statusSettings, openEntry, people, projects, customers] = await Promise.all([readStatusSettings(), getOpenTimeEntry(session.org.id, fieldUserId(session)), listPeople(session.org.id), listProjects(session.org.id), can(session.role, "customer.view", session.permissionOverrides) ? listCustomers(session.org.id) : Promise.resolve([])]);
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
          searchProjects={projects.map(({ id, title, projectNumber, customerName, siteLabel }) => ({ id, title, projectNumber, customerName, siteLabel }))}
          searchCustomers={customers.map(({ id, name, primaryContactName }) => ({ id, name, primaryContactName }))}
          activeShift={openEntry && activeProject ? { projectId: activeProject.id, projectTitle: activeProject.title, startedAt: openEntry.startedAt, paused: Boolean(openEntry.pausedAt) } : null}
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
