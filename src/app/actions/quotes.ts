"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/session";
import { createLocalMaterialQuote } from "@/lib/data/local-store";

export async function createMaterialQuote(input: { projectId: string; selections: Array<{ materialId: string; quantity: number }> }) {
  await requireCapability("quote.edit");
  const selections = input.selections.filter((item) => item.materialId && Number.isFinite(item.quantity) && item.quantity > 0);
  if (!input.projectId || !selections.length) return { ok: false, message: "Select at least one material and quantity." };
  const quote = await createLocalMaterialQuote({ projectId: input.projectId, materialIds: selections });
  revalidatePath(`/projects/${input.projectId}/quote`);
  revalidatePath(`/customers`);
  return { ok: true, quoteId: quote.id, message: `Created ${quote.reference}` };
}
