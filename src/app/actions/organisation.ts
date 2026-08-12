"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { readOrganisationSettings, saveOrganisationSettings } from "@/lib/data/local-store";
import { hasDatabase } from "@/lib/db";
import { storeAsset } from "@/lib/data/assets";
import { saveOrganisation } from "@/lib/data/pg/settings";
import { getOrganisation } from "@/lib/data/pg/org";
import { graphConfigured } from "@/lib/integrations/graph/client";
import { uploadOrganisationCertificateHeader, uploadOrganisationLogo, type OrganisationLogoLocation } from "@/lib/integrations/sharepoint/branding";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter an organisation name."),
  slug: z.string().trim().min(2, "Enter a short slug.").regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  projectNumberPrefix: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers or hyphens only."),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(3),
});

export type OrganisationActionState = { ok: boolean; message?: string };

/** Save the organisation profile and, in production, place new logos in SharePoint. */
export async function updateOrganisation(_state: OrganisationActionState, formData: FormData): Promise<OrganisationActionState> {
  const session = await requireCapability("admin.manage");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the organisation details." };

  const current = hasDatabase
    ? await getOrganisation(session.org.id)
    : await readOrganisationSettings();
  let logoUrl = current?.logoUrl ?? null;
  let logoSharePoint: OrganisationLogoLocation | undefined;
  let certificateHeaderUrl = current?.certificateHeaderUrl ?? null;
  let certificateHeaderSharePoint: OrganisationLogoLocation | undefined;

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (hasDatabase) {
      if (!graphConfigured()) return { ok: false, message: "Logo uploads need the configured SharePoint connection." };
      try {
        logoSharePoint = await uploadOrganisationLogo(logo);
        // Kept behind an authenticated route. A Graph download URL expires, and
        // must never be saved in the organisation settings.
        logoUrl = `/api/organisation/logo?v=${encodeURIComponent(logoSharePoint.itemId)}`;
      } catch (error) {
        return { ok: false, message: `Logo could not be uploaded to SharePoint: ${error instanceof Error ? error.message : String(error)}` };
      }
    } else {
      const stored = await storeAsset("organisation", logo);
      if (!stored.ok) return { ok: false, message: stored.message ?? "Logo could not be saved." };
      logoUrl = stored.url!;
    }
  }

  const certificateHeader = formData.get("certificateHeader");
  if (certificateHeader instanceof File && certificateHeader.size > 0) {
    if (hasDatabase) {
      if (!graphConfigured()) return { ok: false, message: "Certificate header uploads need the configured SharePoint connection." };
      try {
        certificateHeaderSharePoint = await uploadOrganisationCertificateHeader(certificateHeader);
        certificateHeaderUrl = `/api/organisation/certificate-header?v=${encodeURIComponent(certificateHeaderSharePoint.itemId)}`;
      } catch (error) {
        return { ok: false, message: `Certificate header could not be uploaded to SharePoint: ${error instanceof Error ? error.message : String(error)}` };
      }
    } else {
      const stored = await storeAsset("certificate-header", certificateHeader);
      if (!stored.ok) return { ok: false, message: stored.message ?? "Certificate header could not be saved." };
      certificateHeaderUrl = stored.url!;
    }
  }

  const settings = { ...parsed.data, projectNumberPrefix: parsed.data.projectNumberPrefix.toUpperCase(), logoUrl, certificateHeaderUrl };
  if (hasDatabase) await saveOrganisation(session.org.id, settings, logoSharePoint, certificateHeaderSharePoint);
  else await saveOrganisationSettings(settings);
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Organisation settings saved." };
}
