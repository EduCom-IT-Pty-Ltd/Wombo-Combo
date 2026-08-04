"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { archiveProject, deleteProject, restoreProject, updateProjectRecord as updatePgProject } from "@/lib/data/pg/projects";
import { deleteCustomer as deletePgCustomer, setCustomerActive, updateCustomer as updatePgCustomer } from "@/lib/data/pg/customers";
import { graphConfigured } from "@/lib/integrations/graph/client";
import { deleteItem } from "@/lib/integrations/sharepoint/folders";
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
  const session = await requireCapability("project.edit");
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the project details and Project ID." };
  try {
    if (hasDatabase) await updatePgProject(session.org.id, parsed.data);
    else await updateLocalProject(parsed.data);
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not update project." }; }
  revalidatePath(`/projects/${parsed.data.id}`, "layout"); revalidatePath("/projects");
  return { ok: true, message: "Project details saved." };
}

export async function updateCustomerRecord(_state: RecordActionState, formData: FormData): Promise<RecordActionState> {
  const session = await requireCapability("customer.manage");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the customer details." };
  try {
    if (hasDatabase) await updatePgCustomer(session.org.id, parsed.data);
    else await updateLocalCustomer(parsed.data);
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not update customer." }; }
  // Xero is the source of truth, so an edit that only landed here would be
  // silently reverted by the next sync — which reads as the save not working.
  const pushed = hasDatabase ? await pushCustomer(session.org.id, parsed.data.id) : { ok: true, message: undefined };
  revalidatePath(`/customers/${parsed.data.id}`); revalidatePath("/customers"); revalidatePath("/projects", "layout");
  return pushed.ok ? { ok: true, message: "Customer details saved to the portal and Xero." } : { ok: false, message: pushed.message };
}

/** Dynamic so the Xero client stays out of the module graph of every other action here. */
async function pushCustomer(orgId: string, customerId: string): Promise<{ ok: boolean; message?: string }> {
  const { pushCustomerToXero } = await import("@/lib/integrations/xero/contacts");
  return pushCustomerToXero(orgId, customerId);
}

async function pushArchived(orgId: string, customerId: string, archived: boolean): Promise<{ ok: boolean; message?: string }> {
  const { setXeroContactArchived } = await import("@/lib/integrations/xero/contacts");
  return setXeroContactArchived(orgId, customerId, archived);
}

function refreshProjects() { revalidatePath("/projects"); revalidatePath("/", "layout"); }

/**
 * Park a project without touching its status. Owner and Administrator only —
 * `project.archive` is in RESTRICTED, so no override can hand it to anyone else.
 */
export async function archiveProjectRecord(id: string): Promise<RecordActionState> {
  const session = await requireCapability("project.archive");
  if (hasDatabase) {
    if (!await archiveProject(session.org.id, id)) return { ok: false, message: "That project could not be archived." };
  } else {
    await archiveLocalProject(id);
  }
  refreshProjects();
  return { ok: true, message: "Project archived." };
}

export async function restoreProjectRecord(id: string): Promise<RecordActionState> {
  const session = await requireCapability("project.archive");
  if (hasDatabase) {
    if (!await restoreProject(session.org.id, id)) return { ok: false, message: "That project could not be restored." };
  } else {
    await restoreLocalProject(id);
  }
  refreshProjects();
  return { ok: true, message: "Project restored." };
}

/**
 * Delete a project outright, including its SharePoint folder.
 *
 * Postgres first: the row delete cascades to every child table in one statement,
 * and it is the half that decides whether the project still exists to the app.
 * The folder goes second and its failure is reported rather than thrown — the
 * project is already gone, so the only useful outcome is telling someone which
 * folder is now orphaned in SharePoint and needs deleting by hand.
 *
 * There is no undo. `project.delete` is Owner and Administrator only.
 */
export async function deleteProjectRecord(id: string): Promise<RecordActionState> {
  const session = await requireCapability("project.delete");

  if (!hasDatabase) {
    await deleteLocalProject(id);
    refreshProjects();
    return { ok: true, message: "Project deleted." };
  }

  const deleted = await deleteProject(session.org.id, id);
  refreshProjects();
  if (!deleted) return { ok: false, message: "That project could not be found." };

  if (!graphConfigured() || !deleted.sharepointDriveId || !deleted.sharepointFolderItemId) {
    return { ok: true, message: `${deleted.projectNumber} deleted.` };
  }

  try {
    await deleteItem(deleted.sharepointDriveId, deleted.sharepointFolderItemId);
    return { ok: true, message: `${deleted.projectNumber} deleted, including its SharePoint folder.` };
  } catch (error) {
    console.error("[records] SharePoint folder delete failed", error);
    return { ok: false, message: `${deleted.projectNumber} was deleted, but its SharePoint folder could not be removed. Delete it by hand in SharePoint.` };
  }
}
function refreshCustomers() { revalidatePath("/customers"); revalidatePath("/projects", "layout"); }

/**
 * Archiving mirrors into Xero, because the sync reads `ContactStatus` back. Left
 * one-sided, the next sync would find the contact still active there and
 * un-archive it here, which looks exactly like the button not working.
 */
export async function archiveCustomerRecord(id: string): Promise<RecordActionState> {
  const session = await requireCapability("customer.manage");
  if (hasDatabase) {
    if (!await setCustomerActive(session.org.id, id, false)) return { ok: false, message: "That customer could not be archived." };
    const pushed = await pushArchived(session.org.id, id, true);
    refreshCustomers();
    return pushed.ok ? { ok: true, message: "Customer archived here and in Xero." } : { ok: false, message: pushed.message };
  }
  await archiveLocalCustomer(id);
  refreshCustomers();
  return { ok: true, message: "Customer archived." };
}

export async function restoreCustomerRecord(id: string): Promise<RecordActionState> {
  const session = await requireCapability("customer.manage");
  if (hasDatabase) {
    if (!await setCustomerActive(session.org.id, id, true)) return { ok: false, message: "That customer could not be restored." };
    const pushed = await pushArchived(session.org.id, id, false);
    refreshCustomers();
    return pushed.ok ? { ok: true, message: "Customer restored here and in Xero." } : { ok: false, message: pushed.message };
  }
  await restoreLocalCustomer(id);
  refreshCustomers();
  return { ok: true, message: "Customer restored." };
}

/**
 * Delete a customer outright. Refused while they still have projects — the row
 * is what every one of those projects points at, so removing it would take their
 * history with it.
 */
export async function deleteCustomerRecord(id: string): Promise<RecordActionState> {
  const session = await requireCapability("customer.manage");
  try {
    if (hasDatabase) {
      if (!await deletePgCustomer(session.org.id, id)) return { ok: false, message: "That customer could not be found." };
    } else {
      await deleteLocalCustomer(id);
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not delete the customer." };
  }
  refreshCustomers();
  return { ok: true, message: "Customer deleted." };
}
