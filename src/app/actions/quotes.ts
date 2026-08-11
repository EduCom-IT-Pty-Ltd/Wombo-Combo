"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import * as pgQuotes from "@/lib/data/pg/quotes";
import { createLocalMaterialQuote, deleteLocalMaterialQuote, updateLocalMaterialQuote } from "@/lib/data/local-store";
import { getMaterialCataloguePresentation, getProject, listCatalogueMaterials, listCustomerPriceLists, listQuotes } from "@/lib/data/repository";
import { marginPctOf } from "@/lib/domain/money";
import type { QuoteLineInput } from "@/lib/domain/quote";

function revalidateQuote(projectId: string) {
  revalidatePath(`/projects/${projectId}/quote`);
  revalidatePath(`/projects/${projectId}/costing`);
  revalidatePath(`/projects/${projectId}/field`);
  revalidatePath(`/field/${projectId}/field`);
  revalidatePath(`/field/${projectId}/quote`);
  revalidatePath(`/customers`);
}

type Selection = { materialId: string; quantity: number };

/**
 * Turn catalogue selections into priced quote lines.
 *
 * The sell price is written onto the line as an override rather than left to be
 * derived from a margin. A catalogue price is a decision someone made — often a
 * customer-specific one — and rederiving it later from cost would quietly
 * reprice a quote the customer has already seen.
 */
async function buildLines(orgId: string, projectId: string, selections: Selection[], existingMaterialIds = new Set<string>()): Promise<QuoteLineInput[]> {
  const project = await getProject(orgId, projectId);
  if (!project) throw new Error("Project not found.");

  const [materials, priceLists, presentation] = await Promise.all([
    listCatalogueMaterials(orgId),
    listCustomerPriceLists(orgId),
    getMaterialCataloguePresentation(orgId),
  ]);
  const priceList = project.customer.priceListId
    ? priceLists.find((list) => list.id === project.customer.priceListId) ?? null
    : null;

  return selections.map(({ materialId, quantity }) => {
    const material = materials.find((item) => item.id === materialId);
    if (!material) throw new Error("Material not found.");
    if (presentation.hiddenMaterialIds.includes(material.id) && !existingMaterialIds.has(material.id)) {
      throw new Error(`${material.name} is hidden from platform quotes.`);
    }
    // A parent row exists to group variations and has no price of its own.
    if (!material.variation && materials.some((item) => item.name === material.name && item.variation)) {
      throw new Error(`Select a variation of ${material.name}.`);
    }

    const sell = priceList?.entries.find((entry) => entry.materialId === material.id)?.priceCentsPerM2
      ?? material.standardPriceCentsPerM2;

    return {
      catalogueMaterialId: material.id,
      kind: "material" as const,
      description: material.variation ? `${material.name} — ${material.variation}` : material.name,
      quantity,
      unit: "m²",
      unitCostCents: material.costCentsPerM2,
      costCurrency: "AUD",
      fxRate: 1,
      marginPct: marginPctOf(material.costCentsPerM2, sell),
      unitSellCentsOverride: sell,
    };
  });
}

function cleanSelections(selections: Selection[]): Selection[] {
  return selections.filter((item) => item.materialId && Number.isFinite(item.quantity) && item.quantity > 0);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `prepared_by_user_id` is a uuid column, and the bootstrap administrator has no
 * row in `users` — their session id is `bootstrap:<workos id>`. Recording no
 * author is better than failing the save for the one account that exists
 * specifically to get a deployment off the ground.
 */
function authorId(id: string): string | null {
  return UUID.test(id) ? id : null;
}

export async function createMaterialQuote(input: { projectId: string; selections: Selection[] }) {
  const session = await requireCapability("quote.edit");
  const selections = cleanSelections(input.selections);
  if (!input.projectId || !selections.length) return { ok: false, message: "Select at least one material and quantity." };

  try {
    if (!hasDatabase) {
      const quote = await createLocalMaterialQuote({ projectId: input.projectId, materialIds: selections });
      revalidateQuote(input.projectId);
      return { ok: true, quoteId: quote.id, message: `Created ${quote.reference}` };
    }

    const lines = await buildLines(session.org.id, input.projectId, selections);
    const quote = await pgQuotes.saveQuote(session.org.id, {
      projectId: input.projectId,
      lines,
      preparedByUserId: authorId(session.user.id),
    });
    revalidateQuote(input.projectId);
    return { ok: true, quoteId: quote.id, message: `Created ${quote.reference}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create the quote." };
  }
}

export async function updateMaterialQuote(input: { quoteId: string; projectId: string; selections: Selection[] }) {
  const session = await requireCapability("quote.edit");
  const selections = cleanSelections(input.selections);
  if (!input.quoteId || !input.projectId || !selections.length) return { ok: false, message: "Keep at least one material line on the quote." };
  const existing = (await listQuotes(session.org.id, input.projectId)).find((quote) => quote.id === input.quoteId);
  if (!existing) return { ok: false, message: "Quote not found." };

  try {
    if (!hasDatabase) {
      const quote = await updateLocalMaterialQuote({ quoteId: input.quoteId, materialIds: selections });
      if (!quote) return { ok: false, message: "Quote not found." };
      revalidateQuote(input.projectId);
      return { ok: true, message: `Updated ${quote.reference}` };
    }

    const lines = await buildLines(session.org.id, input.projectId, selections, new Set(existing.lines.flatMap((line) => line.catalogueMaterialId ? [line.catalogueMaterialId] : [])));
    const quote = await pgQuotes.replaceQuoteLines(session.org.id, input.quoteId, lines);
    if (!quote) return { ok: false, message: "That quote has been issued and can no longer be edited." };
    revalidateQuote(input.projectId);
    return { ok: true, message: `Updated ${quote.reference}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the quote." };
  }
}

export async function deleteMaterialQuote(input: { quoteId: string; projectId: string }) {
  const session = await requireCapability("quote.edit");
  if (!input.quoteId || !input.projectId) return { ok: false, message: "Quote not found." };
  const belongsToProject = (await listQuotes(session.org.id, input.projectId)).some((quote) => quote.id === input.quoteId);
  if (!belongsToProject) return { ok: false, message: "Quote not found." };

  const quote = hasDatabase
    ? await pgQuotes.deleteQuote(session.org.id, input.quoteId)
    : await deleteLocalMaterialQuote(input.quoteId);
  if (!quote) return { ok: false, message: "That quote has been issued and can no longer be deleted." };
  revalidateQuote(input.projectId);
  return { ok: true, message: `Deleted ${quote.reference}` };
}
