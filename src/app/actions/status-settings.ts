"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { saveStatusSettings } from "@/lib/data/local-store";
import { DEFAULT_STATUS_SETTINGS, type StatusSetting } from "@/lib/domain/status-settings";

const rowSchema = z.object({
  status: z.string(),
  label: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit colour"),
  position: z.coerce.number().int().min(1).max(99),
});

export interface SaveStatusSettingsState { status: "idle" | "success" | "error"; message?: string }

export async function saveStatusSettingsAction(_previous: SaveStatusSettingsState, formData: FormData): Promise<SaveStatusSettingsState> {
  await requireCapability("admin.manage");
  const rows = DEFAULT_STATUS_SETTINGS.map((defaultSetting) => rowSchema.safeParse({
    status: defaultSetting.status,
    label: formData.get(`label_${defaultSetting.status}`),
    color: formData.get(`color_${defaultSetting.status}`),
    position: formData.get(`position_${defaultSetting.status}`),
  }));
  if (rows.some((row) => !row.success)) return { status: "error", message: "Check that each label, colour and position is valid." };
  const validRows = rows.filter((row): row is z.ZodSafeParseSuccess<z.infer<typeof rowSchema>> => row.success);
  const settings: StatusSetting[] = validRows.map((row, index) => ({
    ...row.data,
    status: DEFAULT_STATUS_SETTINGS[index].status,
    inProgressFlow: DEFAULT_STATUS_SETTINGS[index].inProgressFlow,
  }));
  const positions = settings.filter((setting) => setting.inProgressFlow).map((setting) => setting.position);
  if (new Set(positions).size !== positions.length) return { status: "error", message: "Each progress-flow status needs a unique position." };
  await saveStatusSettings(settings);
  revalidatePath("/", "layout");
  return { status: "success", message: "Status flow saved. The labels and colours are now live." };
}
