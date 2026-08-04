"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { saveProductionTemplates } from "@/lib/data/pg/settings";
import { listProductionTemplates } from "@/lib/data/repository";
import type { ProductionTemplate } from "@/lib/data/types";
import {
  createLocalProductionTemplate,
  deleteLocalProductionTemplate,
  updateLocalProductionTemplate,
} from "@/lib/data/local-store";

const templateSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  materials: z.string(),
});

export type ProductionTemplateActionState = { ok: boolean; message?: string };

function parseMaterials(value: string) {
  try {
    const entries: unknown = JSON.parse(value);
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          materialId: typeof item.materialId === "string" ? item.materialId : "",
          mainMaterialName: typeof item.mainMaterialName === "string" ? item.mainMaterialName : "",
          defaultQuantity: Number(item.defaultQuantity),
          allowVariationChoice: Boolean(item.allowVariationChoice),
        };
      })
      .filter((entry) => entry.materialId && entry.mainMaterialName && Number.isFinite(entry.defaultQuantity) && entry.defaultQuantity > 0);
  } catch {
    return [];
  }
}

function revalidateProduction() {
  revalidatePath("/production-templates");
  revalidatePath("/projects", "layout");
}

/** Templates live in the org settings blob, so an edit rewrites the whole array. */
async function saveTemplates(
  orgId: string,
  update: (templates: ProductionTemplate[]) => ProductionTemplate[],
): Promise<void> {
  await saveProductionTemplates(orgId, update(await listProductionTemplates(orgId)));
}

export async function addProductionTemplate(
  _state: ProductionTemplateActionState,
  formData: FormData,
): Promise<ProductionTemplateActionState> {
  const session = await requireCapability("quote.edit");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  const materials = parsed.success ? parseMaterials(parsed.data.materials) : [];
  if (!parsed.success || !materials.length) return { ok: false, message: "Add a name and at least one material." };
  const value = { name: parsed.data.name, description: parsed.data.description || null, materials };
  if (hasDatabase) await saveTemplates(session.org.id, (templates) => [...templates, { id: `pt-${randomUUID()}`, ...value }]);
  else await createLocalProductionTemplate(value);
  revalidateProduction();
  return { ok: true, message: "Production template added." };
}

export async function updateProductionTemplate(
  _state: ProductionTemplateActionState,
  formData: FormData,
): Promise<ProductionTemplateActionState> {
  const session = await requireCapability("quote.edit");
  const id = String(formData.get("id") ?? "");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  const materials = parsed.success ? parseMaterials(parsed.data.materials) : [];
  if (!id || !parsed.success || !materials.length) return { ok: false, message: "Add a name and at least one material." };
  const value = { name: parsed.data.name, description: parsed.data.description || null, materials };
  if (hasDatabase) await saveTemplates(session.org.id, (templates) => templates.map((template) => (template.id === id ? { ...template, ...value } : template)));
  else await updateLocalProductionTemplate(id, value);
  revalidateProduction();
  return { ok: true, message: "Production template updated." };
}

export async function deleteProductionTemplate(id: string) {
  const session = await requireCapability("quote.edit");
  if (hasDatabase) await saveTemplates(session.org.id, (templates) => templates.filter((template) => template.id !== id));
  else await deleteLocalProductionTemplate(id);
  revalidateProduction();
}
