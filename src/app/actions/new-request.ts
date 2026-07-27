"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db";
import { runAutomations, type AutomationEffect } from "@/lib/domain/automation";

const schema = z.object({
  title: z.string().trim().min(3, "Give the project a title"),
  customerId: z.string().min(1, "Select a customer"),
  siteName: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  requestedStartOn: z.string().optional(),
  scopeOfWorks: z.string().trim().optional(),
  initialNotes: z.string().trim().optional(),
});

export interface NewRequestState {
  status: "idle" | "success" | "error";
  message?: string;
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
    // Show the automation the spec attaches to project creation without writing.
    const effects: AutomationEffect[] = [];
    await runAutomations({ kind: "project.created", projectId: "pending" }, async (effect) => {
      effects.push(effect);
    });

    console.info("[demo] create project", { org: session.org.id, ...parsed.data, effects });
    return {
      status: "success",
      message: `Demo mode — would create "${parsed.data.title}" and run ${effects.length} automation effects. Connect Neon to persist.`,
    };
  }

  // TODO(neon): allocate the next project number from project_number_sequences,
  // insert the project + site + contact, then dispatch the created automations.
  throw new Error("createProjectRequest is not implemented against the database yet");
}
