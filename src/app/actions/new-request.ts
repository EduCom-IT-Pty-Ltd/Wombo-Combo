"use server";

import { z } from "zod";
import { requireCapability, type Session } from "@/lib/auth/session";
import { hasDatabase, isDemoMode } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { createProject as createPgProject } from "@/lib/data/pg/projects";
import { createSite as createPgSite } from "@/lib/data/pg/projects";
import { saveWorkflowFieldValues as savePgWorkflowFieldValues } from "@/lib/data/pg/settings";
import { provisionProjectSharePoint } from "@/lib/integrations/sharepoint/provision-project";
import { runAutomations } from "@/lib/domain/automation";
import { applyLocalAutomationEffect, createLocalProject } from "@/lib/data/local-store";
import { getStatusFieldTemplates, listProjectTemplates } from "@/lib/data/repository";
import { transitionProject } from "@/app/actions/projects";
import type { ProjectTemplate } from "@/lib/data/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const schema = z.object({
  title: z.string().trim().min(3, "Give the project a title"),
  customerId: z.string().min(1, "Select a customer"),
  siteName: z.string().trim().optional(),
  siteAddress: z.string().trim().max(300, "Site address is too long").optional(),
  contactName: z.string().trim().optional(),
  requestedStartOn: z.string().optional(),
  scopeOfWorks: z.string().trim().optional(),
  initialNotes: z.string().trim().optional(),
  projectTemplateId: z.string().optional(),
  poNumber: z.string().trim().max(120).optional(),
  projectType: z.enum(["build", "retro"]).default("build"),
});

/**
 * There is no success state: a created project redirects into itself, so the
 * only thing left to report is why it was not created. `projectId` is set on
 * the one partial failure — the project exists but its template did not apply —
 * so the form can still offer a way in.
 */
export interface NewRequestState {
  status: "idle" | "error";
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

  const template = parsed.data.projectTemplateId
    ? (await listProjectTemplates(session.org.id)).find((item) => item.id === parsed.data.projectTemplateId) ?? null
    : null;
  if (parsed.data.projectTemplateId && !template) {
    return { status: "error", message: "That project template is no longer available." };
  }
  // The PO field is only shown once a template is picked, so a number arriving
  // without one came from a stale form and is not an instruction.
  const poNumber = template ? parsed.data.poNumber?.trim() || null : null;

  if (hasDatabase) {
    const project = await createPgProject(session.org.id, {
      title: parsed.data.title,
      customerId: parsed.data.customerId,
      siteId: parsed.data.siteName || parsed.data.siteAddress
        ? await createPgSite(
          session.org.id,
          parsed.data.customerId,
          parsed.data.siteName || parsed.data.siteAddress || "Project site",
          parsed.data.siteAddress,
          parsed.data.contactName,
        )
        : null,
      scopeOfWorks: parsed.data.scopeOfWorks || null,
      initialNotes: parsed.data.initialNotes || null,
      requestedStartOn: parsed.data.requestedStartOn ? new Date(parsed.data.requestedStartOn) : null,
      poNumber,
      projectType: parsed.data.projectType,
      projectNumberPrefix: session.org.projectNumberPrefix,
    });

    if (poNumber) await prefillPurchaseOrderField(session.org.id, project.id, poNumber);

    // Awaited rather than fired and forgotten: on serverless the function can be
    // frozen the moment the response is returned, so a detached promise is not
    // guaranteed to run. It cannot throw, so it cannot fail the creation.
    await provisionProjectSharePoint(session.org.id, project.id);

    // Deliberately no `project.created` automations here. The only rule on that
    // trigger asks for a project number and a document folder, and both have
    // just happened — the number at insert, the folder on the line above.
    // Running them would add nothing and log a "pending" event that is untrue.
    const failure = await applyTemplateStatus(session, project, template);
    if (failure) return failure;

    revalidatePath("/projects");
    // Straight into the project rather than announcing a number and asking for
    // another click. Creating a project is the start of working on it, and the
    // number is on the page we land on anyway.
    redirect(`/projects/${project.id}`);
  }

  if (isDemoMode) {
    const project = await createLocalProject({
      ...parsed.data,
      poNumber: poNumber ?? undefined,
      projectType: parsed.data.projectType,
      projectNumberPrefix: session.org.projectNumberPrefix,
      actorId: session.user.id,
    });
    await runAutomations({ kind: "project.created", projectId: project.id }, async (effect) => {
      await applyLocalAutomationEffect(effect, { kind: "project.created", projectId: project.id });
    });
    const failure = await applyTemplateStatus(session, project, template);
    if (failure) return failure;
    revalidatePath("/projects");
    redirect(`/projects/${project.id}`);
  }

  throw new Error("No database and not in demo mode — check DATABASE_URL and DEMO_MODE.");
}

/**
 * "Pre-fills the PO Received stage", as the form promises.
 *
 * The number is two things: a column on the project, and the answer to the PO
 * stage's own field. Writing only the column left that field blank, so whoever
 * reached the stage was asked for something they had already supplied.
 */
async function prefillPurchaseOrderField(orgId: string, projectId: string, poNumber: string): Promise<void> {
  const fields = (await getStatusFieldTemplates(orgId)).filter((field) => field.status === "approved");
  if (fields.length === 0) return;
  await savePgWorkflowFieldValues(orgId, projectId, fields.map((field) => ({ templateId: field.id, value: poNumber })));
}

/**
 * Move a newly created project to the stage its template starts at.
 *
 * A jump rather than a walk, and the checklists behind it are closed: a job that
 * arrives with a PO never had a quoting stage to do. Both halves are the same
 * `transitionProject` a person drives from the workflow strip, so the audit
 * trail records the move and its reason the same way.
 *
 * Returns a state to report rather than throwing. The project exists by this
 * point, so a failure here is partial — the form says which project it was and
 * offers a link into it.
 */
async function applyTemplateStatus(
  session: Session,
  project: { id: string; projectNumber: string },
  template: ProjectTemplate | null,
): Promise<NewRequestState | null> {
  if (!template || template.startingStatus === "new_request") return null;

  // Checked here rather than left to `transitionProject`, which throws on a
  // missing capability. Creating the project has already succeeded, and that
  // must not come back as a crashed page.
  if (!can(session.role, "project.transition", session.permissionOverrides)) {
    return {
      status: "error",
      projectId: project.id,
      message: `${project.projectNumber} was created, but your role cannot change a project's status, so it stayed at Request Received.`,
    };
  }

  const transition = await transitionProject({
    projectId: project.id,
    to: template.startingStatus,
    confirmJump: true,
    completeSkipped: true,
    overrideReason: "Project created from template",
  });
  if (!transition.ok) {
    return {
      status: "error",
      projectId: project.id,
      message: `${project.projectNumber} was created, but could not be moved to the template status: ${transition.message}`,
    };
  }
  return null;
}
