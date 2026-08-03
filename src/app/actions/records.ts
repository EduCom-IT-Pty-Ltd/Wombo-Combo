"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { archiveProject, deleteProject, restoreProject } from "@/lib/data/pg/projects";
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
export async function archiveCustomerRecord(id: string) { await requireCapability("customer.manage"); await archiveLocalCustomer(id); revalidatePath("/customers"); }
export async function restoreCustomerRecord(id: string) { await requireCapability("customer.manage"); await restoreLocalCustomer(id); revalidatePath("/customers"); }
export async function deleteCustomerRecord(id: string) { await requireCapability("customer.manage"); await deleteLocalCustomer(id); revalidatePath("/customers"); }
