"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import {
  archiveLocalCustomer,
  archiveLocalProject,
  deleteLocalCustomer,
  deleteLocalProject,
  restoreLocalCustomer,
  restoreLocalProject,
  updateLocalCustomer,
  updateLocalProject,
} from "@/lib/data/local-store";

const projectSchema = z.object({
  id: z.string().min(1), projectNumber: z.string().trim().min(2), title: z.string().trim().min(2), customerId: z.string().min(1),
  siteName: z.string().trim().optional(), contactName: z.string().trim().optional(), requestedStartOn: z.string().optional(),
  scopeOfWorks: z.string().trim().optional(), initialNotes: z.string().trim().optional(), poNumber: z.string().trim().max(120).optional(),
});
const customerSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(2), accountType: z.string().trim().optional(), contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().or(z.literal("")), contactPhone: z.string().trim().optional(), paymentTermsDays: z.coerce.number().int().min(0).max(180),
  priceListId: z.string().optional(), defaultProjectTemplateId: z.string().optional(),
});
export type RecordActionState = { ok: boolean; message?: string };

export async function updateProjectRecord(_state: RecordActionState, formData: FormData): Promise<RecordActionState> {
  await requireCapability("project.edit");
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the project details and Project ID." };
  try { await updateLocalProject(parsed.data); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not update project." }; }
  revalidatePath(`/projects/${parsed.data.id}`, "layout"); revalidatePath("/projects");
  return { ok: true, message: "Project details saved." };
}

export async function updateCustomerRecord(_state: RecordActionState, formData: FormData): Promise<RecordActionState> {
  await requireCapability("customer.manage");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the customer details." };
  await updateLocalCustomer(parsed.data);
  revalidatePath(`/customers/${parsed.data.id}`); revalidatePath("/customers"); revalidatePath("/projects", "layout");
  return { ok: true, message: "Customer details saved." };
}

export async function archiveProjectRecord(id: string) { await requireCapability("project.edit"); await archiveLocalProject(id); revalidatePath("/projects"); }
export async function restoreProjectRecord(id: string) { await requireCapability("project.edit"); await restoreLocalProject(id); revalidatePath("/projects"); }
export async function deleteProjectRecord(id: string) { await requireCapability("project.edit"); await deleteLocalProject(id); revalidatePath("/projects"); }
export async function archiveCustomerRecord(id: string) { await requireCapability("customer.manage"); await archiveLocalCustomer(id); revalidatePath("/customers"); }
export async function restoreCustomerRecord(id: string) { await requireCapability("customer.manage"); await restoreLocalCustomer(id); revalidatePath("/customers"); }
export async function deleteCustomerRecord(id: string) { await requireCapability("customer.manage"); await deleteLocalCustomer(id); revalidatePath("/customers"); }
