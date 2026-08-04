"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { readOrganisationSettings, saveOrganisationSettings } from "@/lib/data/local-store";
import { hasDatabase } from "@/lib/db";
import { storeAsset } from "@/lib/data/assets";
import { saveOrganisation } from "@/lib/data/pg/settings";
import { getOrganisation } from "@/lib/data/pg/org";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter an organisation name."),
  slug: z.string().trim().min(2, "Enter a short slug.").regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  projectNumberPrefix: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers or hyphens only."),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(3),
});

export type OrganisationActionState = { ok: boolean; message?: string };

/** Local-only profile and logo save. The organisation table will replace this in production. */
export async function updateOrganisation(_state: OrganisationActionState, formData: FormData): Promise<OrganisationActionState> {
  const session = await requireCapability("admin.manage");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the organisation details." };

  const current = hasDatabase
    ? await getOrganisation(session.org.id)
    : await readOrganisationSettings();
  let logoUrl = current?.logoUrl ?? null;

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    // Goes to Vercel Blob in production. Writing into public/ does not work
    // there: the filesystem is read-only, and runtime writes are not served.
    const stored = await storeAsset("organisation", logo);
    if (!stored.ok) return { ok: false, message: stored.message ?? "Logo could not be saved." };
    logoUrl = stored.url!;
  }

  const settings = { ...parsed.data, projectNumberPrefix: parsed.data.projectNumberPrefix.toUpperCase(), logoUrl };
  if (hasDatabase) await saveOrganisation(session.org.id, settings);
  else await saveOrganisationSettings(settings);
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Organisation settings saved." };
}
