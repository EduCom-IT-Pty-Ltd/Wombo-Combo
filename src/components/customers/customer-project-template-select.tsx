"use client";

import { useState, useTransition } from "react";
import { setCustomerDefaultProjectTemplate } from "@/app/actions/customers";
import { Button } from "@/components/ui";

export function CustomerProjectTemplateSelect({ customerId, initialTemplateId, templates }: { customerId: string; initialTemplateId: string | null | undefined; templates: Array<{ id: string; name: string }> }) {
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="space-y-2"><select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm"><option value="">Standard project</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><div className="flex items-center gap-2"><Button size="sm" variant="primary" disabled={pending} onClick={() => startTransition(async () => { const result = await setCustomerDefaultProjectTemplate(customerId, templateId); setMessage(result.message); })}>{pending ? "Saving…" : "Save default"}</Button>{message ? <p className="text-xs text-muted-foreground">{message}</p> : null}</div></div>;
}
