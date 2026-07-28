"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { PROJECT_STATUSES } from "@/lib/db/schema/enums";
import { saveStatusFieldTemplates, saveStatusSettings, saveStatusTaskTemplates } from "@/lib/data/local-store";
import type { StatusFieldTemplate, StatusSetting, StatusTaskTemplate } from "@/lib/domain/status-settings";

const settingSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
  label: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit colour"),
  inProgressFlow: z.boolean(),
  tasks: z.array(z.string().trim().min(1).max(160)).max(30),
  fields: z.array(z.object({ label: z.string().trim().min(1).max(80), required: z.boolean() })).max(20),
});

const payloadSchema = z.object({ settings: z.array(settingSchema).min(2).max(PROJECT_STATUSES.length) });

export interface SaveStatusSettingsState { status: "idle" | "success" | "error"; message?: string }

export async function saveStatusSettingsAction(_previous: SaveStatusSettingsState, formData: FormData): Promise<SaveStatusSettingsState> {
  await requireCapability("admin.manage");
  const raw = formData.get("status-settings");
  if (typeof raw !== "string") return { status: "error", message: "Status settings could not be read." };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return { status: "error", message: "Status settings could not be read." }; }
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Check each status name, colour and checklist task." };
  const ids = parsed.data.settings.map((setting) => setting.status);
  if (new Set(ids).size !== ids.length) return { status: "error", message: "Each status can only appear once." };

  const flow = parsed.data.settings.filter((setting) => setting.status !== "lost" && setting.status !== "cancelled");
  const offRamps = parsed.data.settings.filter((setting) => setting.status === "lost" || setting.status === "cancelled");
  const settings: StatusSetting[] = [...flow, ...offRamps].map((setting, index) => ({
    status: setting.status,
    label: setting.label,
    color: setting.color,
    position: index + 1,
    inProgressFlow: setting.status !== "lost" && setting.status !== "cancelled",
  }));
  const templates: StatusTaskTemplate[] = flow.flatMap((setting) => setting.tasks.map((title, index) => ({
    id: `workflow-${setting.status}-${index + 1}`,
    status: setting.status,
    title,
    position: index + 1,
  })));
  const fields: StatusFieldTemplate[] = flow.flatMap((setting) => setting.fields.map((field, index) => ({
    id: `field-${setting.status}-${index + 1}`,
    status: setting.status,
    label: field.label,
    required: field.required,
    position: index + 1,
  })));
  await saveStatusSettings(settings);
  await saveStatusTaskTemplates(templates);
  await saveStatusFieldTemplates(fields);
  revalidatePath("/", "layout");
  return { status: "success", message: "Status flow saved." };
}
