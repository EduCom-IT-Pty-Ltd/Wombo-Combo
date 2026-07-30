"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { updateLocalLabourSettings, updateLocalProjectCostingOptions } from "@/lib/data/local-store";

export type LabourActionState = { ok: boolean; message?: string };

const labourSettingsSchema = z.object({
  standardLabourEnabled: z.boolean(),
  standardLabourCostPerEmployee: z.coerce.number().nonnegative(),
  subcontractorRates: z.string(),
});

function parseRates(value: string) {
  return value.split("\n").map((row) => row.trim()).filter(Boolean).map((row) => {
    const [materialId, cost] = row.split(":");
    return { materialId, costCentsPerM2: Math.round(Number(cost) * 100) };
  }).filter((rate) => rate.materialId && Number.isFinite(rate.costCentsPerM2) && rate.costCentsPerM2 > 0);
}

export async function saveLabourSettings(_state: LabourActionState, formData: FormData): Promise<LabourActionState> {
  await requireCapability("labour.manage");
  const parsed = labourSettingsSchema.safeParse({
    standardLabourEnabled: formData.get("standardLabourEnabled") === "on",
    standardLabourCostPerEmployee: formData.get("standardLabourCostPerEmployee"),
    subcontractorRates: formData.get("subcontractorRates"),
  });
  if (!parsed.success || (parsed.data.standardLabourEnabled && parsed.data.standardLabourCostPerEmployee <= 0)) return { ok: false, message: "Enter a standard labour cost before turning it on." };
  await updateLocalLabourSettings({ standardLabourEnabled: parsed.data.standardLabourEnabled, standardLabourCostCentsPerEmployee: Math.round(parsed.data.standardLabourCostPerEmployee * 100), subcontractorMaterialRates: parseRates(parsed.data.subcontractorRates) });
  revalidatePath("/labour"); revalidatePath("/projects", "layout");
  return { ok: true, message: "Labour settings saved." };
}

const projectCostingSchema = z.object({ projectId: z.string().min(1), standardLabourEnabled: z.boolean(), employeeCount: z.coerce.number().int().min(0).max(99), includeSubcontractorMaterialCosts: z.boolean() });

export async function saveProjectCostingOptions(_state: LabourActionState, formData: FormData): Promise<LabourActionState> {
  await requireCapability("finance.manage");
  const parsed = projectCostingSchema.safeParse({ projectId: formData.get("projectId"), standardLabourEnabled: formData.get("standardLabourEnabled") === "on", employeeCount: formData.get("employeeCount"), includeSubcontractorMaterialCosts: formData.get("includeSubcontractorMaterialCosts") === "on" });
  if (!parsed.success) return { ok: false, message: "Enter a valid employee count." };
  await updateLocalProjectCostingOptions(parsed.data.projectId, { standardLabourEnabled: parsed.data.standardLabourEnabled, employeeCount: parsed.data.employeeCount, includeSubcontractorMaterialCosts: parsed.data.includeSubcontractorMaterialCosts });
  revalidatePath(`/projects/${parsed.data.projectId}/costing`); revalidatePath(`/field/${parsed.data.projectId}/costing`); revalidatePath("/projects", "layout");
  return { ok: true, message: "Costing options saved." };
}
