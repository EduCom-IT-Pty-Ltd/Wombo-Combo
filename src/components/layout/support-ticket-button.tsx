"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LifeBuoy, Send, X } from "lucide-react";
import { submitSupportTicket, type SupportTicketActionState } from "@/app/actions/support-ticket";
import { Button } from "@/components/ui";

const initialState: SupportTicketActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm";
const textClass = "min-h-36 w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm";

export function SupportTicketButton() {
  const [open, setOpen] = useState(false);

  return <>
    <Button type="button" variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
      <LifeBuoy className="size-4" />
      Submit ticket
    </Button>
    {open ? <SupportTicketDialog onClose={() => setOpen(false)} /> : null}
  </>;
}

function SupportTicketDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(submitSupportTicket, initialState);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, pending]);

  return createPortal(
      <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="support-ticket-title">
        <div className="pb-safe w-full max-w-lg rounded-t-2xl border border-border-strong bg-surface shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <div>
              <h2 id="support-ticket-title" className="text-lg font-bold">Submit a ticket</h2>
              <p className="mt-1 text-sm text-muted-foreground">Send an issue or feature request to the portal team.</p>
            </div>
            <Button type="button" size="sm" variant="ghost" aria-label="Close ticket form" disabled={pending} onClick={onClose}><X className="size-4" /></Button>
          </div>
          <form action={action} className="space-y-4 p-5">
            <label className="block text-sm font-semibold">Type
              <select name="kind" defaultValue="issue" className={`${inputClass} mt-1.5`} disabled={pending}>
                <option value="issue">Issue</option>
                <option value="feature_request">Feature Request</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">Details
              <textarea name="message" required minLength={5} maxLength={4000} className={`${textClass} mt-1.5`} placeholder="Tell us what happened or what would make the portal better…" disabled={pending} />
            </label>
            {state.message ? <p className={state.ok ? "text-sm font-medium text-emerald-600" : "text-sm font-medium text-[var(--tone-rose-fg)]"} role="status">{state.message}</p> : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
              <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={pending || state.ok}><Send className="size-4" />{pending ? "Sending…" : "Send ticket"}</Button>
            </div>
          </form>
        </div>
      </div>,
      document.body,
    );
}
