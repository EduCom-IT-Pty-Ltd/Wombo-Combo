"use client";

import { createContext, useContext, useMemo } from "react";
import type { ProjectStatus } from "@/lib/domain/status";
import { DEFAULT_STATUS_SETTINGS, orderedFlow, type StatusSetting } from "@/lib/domain/status-settings";

const StatusSettingsContext = createContext<StatusSetting[]>(DEFAULT_STATUS_SETTINGS);

export function StatusSettingsProvider({ settings, children }: { settings: StatusSetting[]; children: React.ReactNode }) {
  return <StatusSettingsContext.Provider value={settings}>{children}</StatusSettingsContext.Provider>;
}

export function useStatusSettings() {
  const settings = useContext(StatusSettingsContext);
  return useMemo(() => ({
    settings,
    flow: orderedFlow(settings),
    settingFor: (status: ProjectStatus) => settings.find((setting) => setting.status === status) ?? DEFAULT_STATUS_SETTINGS.find((setting) => setting.status === status),
  }), [settings]);
}
