"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { createCustomer as createPgCustomer } from "@/lib/data/pg/customers";
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
  // The session carries the tenant id, so the capability check and the orgId
  // come from the same call and cannot disagree.
  const session = await requireCapability("customer.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: CreateCustomerState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof z.infer<typeof schema>;
      errors[field] ??= issue.message;
    }
    return { status: "error", message: "Check the highlighted fields", errors };
  }
  if (hasDatabase) {
    const customer = await createPgCustomer(session.org.id, parsed.data);
    // Xero owns the customer list, so a customer raised here has to exist there
    // too — otherwise the first quote for them has nothing to bill against. The
    // push is reported rather than thrown: the customer is already saved, and
    // failing the form would lose the typing over a Xero outage. The next sync
    // or the first quote export links it up.
    const { pushCustomerToXero } = await import("@/lib/integrations/xero/contacts");
    const pushed = await pushCustomerToXero(session.org.id, customer.id);
    // The list and the detail page both cache; without this the new customer is
    // written and then not visible on the page you land on.
    revalidatePath("/customers");
    return {
      status: "success",
      customerId: customer.id,
      message: pushed.ok ? `${customer.name} was created in the portal and in Xero.` : `${customer.name} was created. ${pushed.message}`,
    };
  }

  const customer = await createLocalCustomer(parsed.data);
  return { status: "success", customerId: customer.id, message: `${customer.name} was saved locally.` };
}
