"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { listCustomersForPortalPresentation } from "@/lib/data/repository";
import { saveCustomerPortalPresentation } from "@/lib/data/pg/customers";
import { saveLocalCustomerPortalPresentation } from "@/lib/data/local-store";

export type CustomerPresentationActionState = { ok: boolean; message?: string };

const entriesSchema = z.array(z.object({
  id: z.string().min(1),
  portalVisible: z.boolean(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
}));

function parsePresentation(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try { return entriesSchema.safeParse(JSON.parse(value)); } catch { return null; }
}

/**
 * Saves only customer presentation choices held by this portal. Xero contact
 * information is never read for a write and this action makes no Xero request.
 */
export async function saveCustomerPortalPresentationAction(
  _previous: CustomerPresentationActionState,
  formData: FormData,
): Promise<CustomerPresentationActionState> {
  const session = await requireCapability("customer.manage");
  const parsed = parsePresentation(formData.get("presentation"));
  if (!parsed?.success) return { ok: false, message: "Could not read the customer display settings." };

  const availableIds = new Set((await listCustomersForPortalPresentation(session.org.id)).map((customer) => customer.id));
  const entries = parsed.data.filter((entry) => availableIds.has(entry.id));
  if (hasDatabase) await saveCustomerPortalPresentation(session.org.id, entries);
  else await saveLocalCustomerPortalPresentation(entries);

  revalidatePath("/customers");
  revalidatePath("/customers/[id]", "page");
  revalidatePath("/projects", "layout");
  revalidatePath("/schedule");
  revalidatePath("/field");
  return { ok: true, message: "Portal customer display saved. Xero was not changed." };
}
