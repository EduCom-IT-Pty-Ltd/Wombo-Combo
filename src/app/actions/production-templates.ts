"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
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
  return value
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [materialId, quantity] = row.split(":");
      return { materialId, defaultQuantity: Number(quantity) };
    })
    .filter((entry) => entry.materialId && Number.isFinite(entry.defaultQuantity) && entry.defaultQuantity > 0);
}

function revalidateProduction() {
  revalidatePath("/production-templates");
  revalidatePath("/projects", "layout");
}

export async function addProductionTemplate(
  _state: ProductionTemplateActionState,
  formData: FormData,
): Promise<ProductionTemplateActionState> {
  await requireCapability("quote.edit");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  const materials = parsed.success ? parseMaterials(parsed.data.materials) : [];
  if (!parsed.success || !materials.length) return { ok: false, message: "Add a name and at least one material." };
  await createLocalProductionTemplate({ name: parsed.data.name, description: parsed.data.description || null, materials });
  revalidateProduction();
  return { ok: true, message: "Production template added." };
}

export async function updateProductionTemplate(
  _state: ProductionTemplateActionState,
  formData: FormData,
): Promise<ProductionTemplateActionState> {
  await requireCapability("quote.edit");
  const id = String(formData.get("id") ?? "");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  const materials = parsed.success ? parseMaterials(parsed.data.materials) : [];
  if (!id || !parsed.success || !materials.length) return { ok: false, message: "Add a name and at least one material." };
  await updateLocalProductionTemplate(id, { name: parsed.data.name, description: parsed.data.description || null, materials });
  revalidateProduction();
  return { ok: true, message: "Production template updated." };
}

export async function deleteProductionTemplate(id: string) {
  await requireCapability("quote.edit");
  await deleteLocalProductionTemplate(id);
  revalidateProduction();
}
