"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db";
import { createLocalCustomer } from "@/lib/data/local-store";
import { setLocalCustomerDefaultProjectTemplate } from "@/lib/data/local-store";
import { listProjectTemplates } from "@/lib/data/repository";
import { revalidatePath } from "next/cache";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the customer name"),
  accountType: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email("Enter a valid email address").or(z.literal("")),
  contactPhone: z.string().trim().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(180),
  priceListId: z.string().optional(),
  defaultProjectTemplateId: z.string().optional(),
});

export interface CreateCustomerState {
  status: "idle" | "success" | "error";
  message?: string;
  customerId?: string;
  errors?: Partial<Record<keyof z.infer<typeof schema>, string>>;
}

export async function setCustomerDefaultProjectTemplate(customerId: string, projectTemplateId: string) {
  const session = await requireCapability("customer.manage");
  if (projectTemplateId && !(await listProjectTemplates(session.org.id)).some((template) => template.id === projectTemplateId)) return { ok: false, message: "That template is no longer available." };
  await setLocalCustomerDefaultProjectTemplate(customerId, projectTemplateId || null);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/projects/new");
  return { ok: true, message: "Default project template saved." };
}

export async function createCustomer(_previous: CreateCustomerState, formData: FormData): Promise<CreateCustomerState> {
  await requireCapability("customer.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: CreateCustomerState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof z.infer<typeof schema>;
      errors[field] ??= issue.message;
    }
    return { status: "error", message: "Check the highlighted fields", errors };
  }
  if (!isDemoMode) throw new Error("Customer creation is not implemented against the production database yet");
  const customer = await createLocalCustomer(parsed.data);
  return { status: "success", customerId: customer.id, message: `${customer.name} was saved locally.` };
}
