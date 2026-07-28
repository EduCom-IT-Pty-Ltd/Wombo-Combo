"use server";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { readOrganisationSettings, saveOrganisationSettings } from "@/lib/data/local-store";

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
  await requireCapability("admin.manage");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the organisation details." };

  const current = await readOrganisationSettings();
  let logoUrl = current.logoUrl;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" } as Record<string, string>)[logo.type];
    if (!extension) return { ok: false, message: "Logo must be a PNG, JPG, WebP or SVG image." };
    if (logo.size > 2 * 1024 * 1024) return { ok: false, message: "Logo must be 2 MB or smaller." };
    await mkdir(join(process.cwd(), "public", "uploads"), { recursive: true });
    logoUrl = `/uploads/organisation-${randomUUID()}.${extension}`;
    await writeFile(join(process.cwd(), "public", logoUrl), Buffer.from(await logo.arrayBuffer()));
  }

  await saveOrganisationSettings({ ...parsed.data, projectNumberPrefix: parsed.data.projectNumberPrefix.toUpperCase(), logoUrl });
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  return { ok: true, message: "Organisation settings saved." };
}
