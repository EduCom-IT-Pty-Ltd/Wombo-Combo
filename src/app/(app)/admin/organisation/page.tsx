import { isDemoMode } from "@/lib/db";
import { getOrganisationSettings } from "@/lib/data/repository";
import { OrganisationSettingsForm } from "@/components/admin/organisation-settings";
import { requireSettingsAccess } from "../guard";

export const metadata = { title: "Organisation · Settings" };

export default async function OrganisationSettingsPage() {
  const session = await requireSettingsAccess();
  const organisation = await getOrganisationSettings(session.org.id);

  /* Keyed to `isDemoMode` (is there a database?) rather than `session.isDemo`
     (is the user really signed in?). Once WorkOS is configured but
     DATABASE_URL is not, those diverge — and it is persistence, not auth,
     that decides whether this warning is true. */
  return <OrganisationSettingsForm settings={organisation} isDemo={isDemoMode} />;
}
