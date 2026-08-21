"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { isXeroManagedCustomer } from "@/lib/data/pg/customers";
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
  if (hasDatabase && await isXeroManagedCustomer(session.org.id, customerId)) {
    return { ok: false, message: "Customer settings are managed in Xero. Only the portal colour and visibility can be changed here." };
  }
  if (projectTemplateId && !(await listProjectTemplates(session.org.id)).some((template) => template.id === projectTemplateId)) return { ok: false, message: "That template is no longer available." };
  if (hasDatabase) {
    const { setCustomerDefaultProjectTemplate: setPg } = await import("@/lib/data/pg/settings");
    await setPg(session.org.id, customerId, projectTemplateId || null);
  } else {
    await setLocalCustomerDefaultProjectTemplate(customerId, projectTemplateId || null);
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/projects/new");
  return { ok: true, message: "Default project template saved." };
}

export async function createCustomer(_previous: CreateCustomerState, formData: FormData): Promise<CreateCustomerState> {
  // Retain the capability check in demo mode too, even though the local store
  // does not require an organisation id.
  const _session = await requireCapability("customer.manage");
  if (hasDatabase) {
    return {
      status: "error",
      message: "Customers are managed in Xero. Create the customer there, then use Sync from Xero in the portal.",
    };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: CreateCustomerState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof z.infer<typeof schema>;
      errors[field] ??= issue.message;
    }
    return { status: "error", message: "Check the highlighted fields", errors };
  }
  const customer = await createLocalCustomer(parsed.data);
  return { status: "success", customerId: customer.id, message: `${customer.name} was saved locally.` };
}
