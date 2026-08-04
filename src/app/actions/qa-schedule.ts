"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { scheduleInspection } from "@/lib/data/pg/field";
import { recordEvent } from "@/lib/data/pg/workflow";
import { scheduleLocalInspection } from "@/lib/data/local-store";

const schema = z.object({ inspectionId: z.string().optional(), projectId: z.string().min(1), inspectorId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type QaScheduleActionState = { ok: boolean; message?: string };

export async function scheduleQaInspection(_state: QaScheduleActionState, formData: FormData): Promise<QaScheduleActionState> {
  const session = await requireCapability("qa.inspect");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Choose an inspector and inspection date." };
  try {
    if (hasDatabase) {
      await scheduleInspection(session.org.id, parsed.data);
      await recordEvent({
        orgId: session.org.id,
        projectId: parsed.data.projectId,
        type: "qa.scheduled",
        summary: `QA inspection scheduled for ${parsed.data.date}`,
        actorUserId: parsed.data.inspectorId,
      });
    } else {
      await scheduleLocalInspection(parsed.data);
    }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not schedule QA." }; }
  revalidatePath("/qa"); revalidatePath("/schedule"); revalidatePath(`/projects/${parsed.data.projectId}/qa`); revalidatePath(`/projects/${parsed.data.projectId}/schedule`);
  return { ok: true, message: "QA inspection added to the calendar." };
}
