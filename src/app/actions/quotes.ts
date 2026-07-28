"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/session";
import { createLocalMaterialQuote, deleteLocalMaterialQuote, updateLocalMaterialQuote } from "@/lib/data/local-store";
import { listQuotes } from "@/lib/data/repository";

function revalidateQuote(projectId: string) {
  revalidatePath(`/projects/${projectId}/quote`);
  revalidatePath(`/projects/${projectId}/costing`);
  revalidatePath(`/projects/${projectId}/field`);
  revalidatePath(`/field/${projectId}/field`);
  revalidatePath(`/field/${projectId}/quote`);
  revalidatePath(`/customers`);
}

export async function createMaterialQuote(input: { projectId: string; selections: Array<{ materialId: string; quantity: number }> }) {
  await requireCapability("quote.edit");
  const selections = input.selections.filter((item) => item.materialId && Number.isFinite(item.quantity) && item.quantity > 0);
  if (!input.projectId || !selections.length) return { ok: false, message: "Select at least one material and quantity." };
  const quote = await createLocalMaterialQuote({ projectId: input.projectId, materialIds: selections });
  revalidateQuote(input.projectId);
  return { ok: true, quoteId: quote.id, message: `Created ${quote.reference}` };
}

export async function updateMaterialQuote(input: { quoteId: string; projectId: string; selections: Array<{ materialId: string; quantity: number }> }) {
  const session = await requireCapability("quote.edit");
  const selections = input.selections.filter((item) => item.materialId && Number.isFinite(item.quantity) && item.quantity > 0);
  if (!input.quoteId || !input.projectId || !selections.length) return { ok: false, message: "Keep at least one material line on the quote." };
  const belongsToProject = (await listQuotes(session.org.id, input.projectId)).some((quote) => quote.id === input.quoteId);
  if (!belongsToProject) return { ok: false, message: "Quote not found." };
  const quote = await updateLocalMaterialQuote({ quoteId: input.quoteId, materialIds: selections });
  if (!quote) return { ok: false, message: "Quote not found." };
  revalidateQuote(input.projectId);
  return { ok: true, message: `Updated ${quote.reference}` };
}

export async function deleteMaterialQuote(input: { quoteId: string; projectId: string }) {
  const session = await requireCapability("quote.edit");
  if (!input.quoteId || !input.projectId) return { ok: false, message: "Quote not found." };
  const belongsToProject = (await listQuotes(session.org.id, input.projectId)).some((quote) => quote.id === input.quoteId);
  if (!belongsToProject) return { ok: false, message: "Quote not found." };
  const quote = await deleteLocalMaterialQuote(input.quoteId);
  if (!quote) return { ok: false, message: "Quote not found." };
  revalidateQuote(input.projectId);
  return { ok: true, message: `Deleted ${quote.reference}` };
}
