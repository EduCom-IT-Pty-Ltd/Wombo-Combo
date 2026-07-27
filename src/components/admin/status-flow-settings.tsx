"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveStatusSettingsAction, type SaveStatusSettingsState } from "@/app/actions/status-settings";
import { Button, Card, CardHeader } from "@/components/ui";
import type { StatusSetting, StatusTaskTemplate } from "@/lib/domain/status-settings";

const initial: SaveStatusSettingsState = { status: "idle" };
const inputClass = "h-10 w-full rounded-[var(--radius)] border border-border-strong bg-surface px-2 text-sm text-foreground";

export function StatusFlowSettings({ settings, templates }: { settings: StatusSetting[]; templates: StatusTaskTemplate[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveStatusSettingsAction, initial);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);
  const flow = settings.filter((setting) => setting.inProgressFlow).sort((a, b) => a.position - b.position);
  const terminal = settings.filter((setting) => !setting.inProgressFlow).sort((a, b) => a.position - b.position);
  return <form action={action}><Card><CardHeader title="Project status flow" description="Edit the display name, colour and position. Progress-bar segments use these exact colours." />
    <div className="overflow-x-auto"><table className="w-full min-w-[38rem] text-sm"><thead><tr className="border-b border-border-subtle text-left text-xs text-muted-foreground"><th className="px-4 py-2">Position</th><th className="px-4 py-2">Status name</th><th className="px-4 py-2">Colour</th><th className="px-4 py-2">Preview</th></tr></thead><tbody className="divide-y divide-border-subtle">{flow.map((setting) => <StatusRow key={setting.status} setting={setting} />)}</tbody></table></div>
    <div className="border-t border-border-subtle px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Terminal statuses</p><div className="mt-2 grid gap-3 sm:grid-cols-2">{terminal.map((setting) => <TerminalStatusRow key={setting.status} setting={setting} />)}</div></div>
    <div className="border-t border-border-subtle px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Stage checklist tasks</p><p className="mt-1 text-xs text-muted-foreground">Add as many tasks as you need: every line becomes a separate checklist task on projects at that stage.</p><div className="mt-3 grid gap-3 lg:grid-cols-2">{flow.map((setting) => <label key={setting.status} className="block rounded-[var(--radius)] border border-border-subtle p-3"><span className="text-xs font-medium">{setting.label}</span><textarea name={`tasks_${setting.status}`} rows={4} defaultValue={templates.filter((task) => task.status === setting.status).sort((a, b) => a.position - b.position).map((task) => task.title).join("\n")} className="mt-2 w-full rounded-[var(--radius)] border border-border-strong bg-surface px-2 py-2 text-sm" placeholder={"First task\nSecond task\nThird task"} /></label>)}</div></div>
    <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-3"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save status flow"}</Button>{state.message ? <p className={state.status === "error" ? "text-xs text-[var(--tone-rose-fg)]" : "text-xs text-[var(--tone-emerald-fg)]"}>{state.message}</p> : null}</div>
  </Card></form>;
}

function StatusRow({ setting }: { setting: StatusSetting }) {
  return <tr><td className="px-4 py-2"><input name={`position_${setting.status}`} type="number" min="1" max="99" defaultValue={setting.position} className="h-10 w-16 rounded-[var(--radius)] border border-border-strong bg-surface px-2 text-sm" /></td><td className="px-4 py-2"><input name={`label_${setting.status}`} defaultValue={setting.label} className={inputClass} /></td><td className="px-4 py-2"><input name={`color_${setting.status}`} type="color" defaultValue={setting.color} className="h-10 w-14 rounded border border-border-strong bg-surface p-1" /></td><td className="px-4 py-2"><span className="inline-flex rounded-full px-2 py-1 text-xs font-medium text-white" style={{ backgroundColor: setting.color }}>{setting.label}</span></td></tr>;
}

function TerminalStatusRow({ setting }: { setting: StatusSetting }) {
  return <div className="flex items-center gap-2"><input name={`label_${setting.status}`} defaultValue={setting.label} className={inputClass} /><input type="hidden" name={`position_${setting.status}`} value={setting.position} /><input name={`color_${setting.status}`} type="color" defaultValue={setting.color} className="h-10 w-14 rounded border border-border-strong bg-surface p-1" /></div>;
}
