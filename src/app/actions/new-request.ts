"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase, isDemoMode } from "@/lib/db";
import { createProject as createPgProject } from "@/lib/data/pg/projects";
import { createSite as createPgSite } from "@/lib/data/pg/projects";
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

  if (hasDatabase) {
    // Templates drive automations and an opening status transition, and both of
    // those still write through the JSON store. Rather than accept the project
    // and quietly skip the template — which would leave a job sitting in
    // new_request with none of its checklists — refuse the combination and say
    // so. Plain projects are unaffected.
    if (parsed.data.projectTemplateId) {
      return {
        status: "error",
        message: "Project templates are not available against the database yet. Create the project without a template for now.",
      };
    }

    const project = await createPgProject(session.org.id, {
      title: parsed.data.title,
      customerId: parsed.data.customerId,
      siteId: parsed.data.siteName
        ? await createPgSite(session.org.id, parsed.data.customerId, parsed.data.siteName)
        : null,
      scopeOfWorks: parsed.data.scopeOfWorks || null,
      initialNotes: parsed.data.initialNotes || null,
      requestedStartOn: parsed.data.requestedStartOn ? new Date(parsed.data.requestedStartOn) : null,
      projectNumberPrefix: session.org.projectNumberPrefix,
    });

    revalidatePath("/projects");
    return { status: "success", projectId: project.id, message: `Created ${project.projectNumber}.` };
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
      // Templates promise to clear the checklists for the stages they start
      // past — a job that arrives with a PO never had a quoting stage to do.
      const transition = await transitionProject({ projectId: project.id, to: template.startingStatus, confirmJump: true, completeSkipped: true, overrideReason: "Project created from template" });
      if (!transition.ok) return { status: "error", projectId: project.id, message: `${project.projectNumber} was created, but could not be moved to the template status: ${transition.message}` };
    }
    revalidatePath("/projects");

    return {
      status: "success",
      projectId: project.id,
      message: `Created ${project.projectNumber}${template ? ` using ${template.name}` : ""}. ${effects.length} workflow actions recorded.`,
    };
  }

  throw new Error("No database and not in demo mode — check DATABASE_URL and DEMO_MODE.");
}
