"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { PROJECT_STATUSES } from "@/lib/db/schema/enums";
import { clearCustomerDefaultProjectTemplate, saveProjectTemplates } from "@/lib/data/pg/settings";
import { listProjectTemplates } from "@/lib/data/repository";
import type { ProjectTemplate } from "@/lib/data/types";
import { createLocalProjectTemplate, deleteLocalProjectTemplate, updateLocalProjectTemplate } from "@/lib/data/local-store";

const schema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  startingStatus: z.enum(PROJECT_STATUSES),
});

export type ProjectTemplateActionState = { ok: boolean; message?: string };

function revalidateTemplates() {
  revalidatePath("/projects");
  revalidatePath("/projects/new");
  revalidatePath("/customers", "layout");
}

/** Templates live in the org settings blob, so an edit rewrites the whole array. */
async function saveTemplates(
  orgId: string,
  update: (templates: ProjectTemplate[]) => ProjectTemplate[],
): Promise<void> {
  await saveProjectTemplates(orgId, update(await listProjectTemplates(orgId)));
}

export async function addProjectTemplate(_state: ProjectTemplateActionState, formData: FormData): Promise<ProjectTemplateActionState> {
  const session = await requireCapability("project.create");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a name and starting status." };
  const value = { name: parsed.data.name, description: parsed.data.description || null, startingStatus: parsed.data.startingStatus };
  if (hasDatabase) await saveTemplates(session.org.id, (templates) => [...templates, { id: `project-template-${randomUUID()}`, ...value }]);
  else await createLocalProjectTemplate(value);
  revalidateTemplates();
  return { ok: true, message: "Project template added." };
}

export async function updateProjectTemplate(_state: ProjectTemplateActionState, formData: FormData): Promise<ProjectTemplateActionState> {
  const session = await requireCapability("project.create");
  const id = String(formData.get("id") ?? "");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!id || !parsed.success) return { ok: false, message: "Check the template details." };
  const value = { name: parsed.data.name, description: parsed.data.description || null, startingStatus: parsed.data.startingStatus };
  if (hasDatabase) await saveTemplates(session.org.id, (templates) => templates.map((template) => (template.id === id ? { ...template, ...value } : template)));
  else await updateLocalProjectTemplate(id, value);
  revalidateTemplates();
  return { ok: true, message: "Project template updated." };
}

export async function deleteProjectTemplate(id: string) {
  const session = await requireCapability("project.create");
  if (hasDatabase) {
    await saveTemplates(session.org.id, (templates) => templates.filter((template) => template.id !== id));
    await clearCustomerDefaultProjectTemplate(session.org.id, id);
  } else {
    await deleteLocalProjectTemplate(id);
  }
  revalidateTemplates();
}
