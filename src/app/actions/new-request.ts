"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db";
import { runAutomations, type AutomationEffect } from "@/lib/domain/automation";
import { applyLocalAutomationEffect, createLocalProject } from "@/lib/data/local-store";
import { listProjectTemplates } from "@/lib/data/repository";
import { transitionProject } from "@/app/actions/projects";
import { revalidatePath } from "next/cache";

const schema = z.object({
  title: z.string().trim().min(3, "Give the project a title"),
  customerId: z.string().min(1, "Select a customer"),
  siteName: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  requestedStartOn: z.string().optional(),
  scopeOfWorks: z.string().trim().optional(),
  initialNotes: z.string().trim().optional(),
  projectTemplateId: z.string().optional(),
  poNumber: z.string().trim().max(120).optional(),
});

export interface NewRequestState {
  status: "idle" | "success" | "error";
  message?: string;
  projectId?: string;
  errors?: Partial<Record<keyof z.infer<typeof schema>, string>>;
}

export async function createProjectRequest(
  _prev: NewRequestState,
  formData: FormData,
): Promise<NewRequestState> {
  const session = await requireCapability("project.create");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: NewRequestState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof schema>;
      errors[key] ??= issue.message;
    }
    return { status: "error", message: "Check the highlighted fields", errors };
  }

  if (isDemoMode) {
    const template = parsed.data.projectTemplateId ? (await listProjectTemplates(session.org.id)).find((item) => item.id === parsed.data.projectTemplateId) : null;
    if (parsed.data.projectTemplateId && !template) return { status: "error", message: "That project template is no longer available." };
    const project = await createLocalProject({
      ...parsed.data,
      poNumber: template ? parsed.data.poNumber : undefined,
      projectNumberPrefix: session.org.projectNumberPrefix,
      actorId: session.user.id,
    });
    const effects: AutomationEffect[] = [];
    await runAutomations({ kind: "project.created", projectId: project.id }, async (effect) => {
      effects.push(effect);
      await applyLocalAutomationEffect(effect, { kind: "project.created", projectId: project.id });
    });
    if (template && template.startingStatus !== "new_request") {
      const transition = await transitionProject({ projectId: project.id, to: template.startingStatus, confirmJump: true, overrideReason: "Project created from template" });
      if (!transition.ok) return { status: "error", projectId: project.id, message: `${project.projectNumber} was created, but could not be moved to the template status: ${transition.message}` };
    }
    revalidatePath("/projects");

    return {
      status: "success",
      projectId: project.id,
      message: `Created ${project.projectNumber}${template ? ` using ${template.name}` : ""}. ${effects.length} workflow actions recorded.`,
    };
  }

  // TODO(neon): allocate the next project number from project_number_sequences,
  // insert the project + site + contact, then dispatch the created automations.
  throw new Error("createProjectRequest is not implemented against the database yet");
}
