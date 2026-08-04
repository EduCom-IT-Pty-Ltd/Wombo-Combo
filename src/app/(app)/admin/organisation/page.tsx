import { isDemoMode } from "@/lib/db";
import { readOrganisationSettings } from "@/lib/data/local-store";
import { OrganisationSettingsForm } from "@/components/admin/organisation-settings";

export const metadata = { title: "Organisation · Settings" };

export default async function OrganisationSettingsPage() {
  const organisation = await readOrganisationSettings();

  /* Keyed to `isDemoMode` (is there a database?) rather than `session.isDemo`
     (is the user really signed in?). Once WorkOS is configured but
     DATABASE_URL is not, those diverge — and it is persistence, not auth,
     that decides whether this warning is true. */
  return <OrganisationSettingsForm settings={organisation} isDemo={isDemoMode} />;
}
