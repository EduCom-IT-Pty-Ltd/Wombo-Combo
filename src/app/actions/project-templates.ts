"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { PROJECT_STATUSES } from "@/lib/db/schema/enums";
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

export async function addProjectTemplate(_state: ProjectTemplateActionState, formData: FormData): Promise<ProjectTemplateActionState> {
  await requireCapability("project.create");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a name and starting status." };
  await createLocalProjectTemplate({ name: parsed.data.name, description: parsed.data.description || null, startingStatus: parsed.data.startingStatus });
  revalidateTemplates();
  return { ok: true, message: "Project template added." };
}

export async function updateProjectTemplate(_state: ProjectTemplateActionState, formData: FormData): Promise<ProjectTemplateActionState> {
  await requireCapability("project.create");
  const id = String(formData.get("id") ?? "");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!id || !parsed.success) return { ok: false, message: "Check the template details." };
  await updateLocalProjectTemplate(id, { name: parsed.data.name, description: parsed.data.description || null, startingStatus: parsed.data.startingStatus });
  revalidateTemplates();
  return { ok: true, message: "Project template updated." };
}

export async function deleteProjectTemplate(id: string) {
  await requireCapability("project.create");
  await deleteLocalProjectTemplate(id);
  revalidateTemplates();
}
