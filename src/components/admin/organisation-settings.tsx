"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Building2, ImagePlus } from "lucide-react";
import { updateOrganisation, type OrganisationActionState } from "@/app/actions/organisation";
import { Button, Card, CardHeader } from "@/components/ui";
import type { OrganisationSettings } from "@/lib/data/types";

const initialState: OrganisationActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary";

export function OrganisationSettingsForm({ settings, isDemo }: { settings: OrganisationSettings; isDemo: boolean }) {
  const [state, action, pending] = useActionState(updateOrganisation, initialState);
  return (
    <form action={action}>
      <Card className="overflow-hidden">
        <CardHeader title="Organisation profile" description="Your company name, project reference settings and the logo shown in the app." />
        <div className="grid gap-5 border-t border-border-subtle p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Organisation name</span><input name="name" defaultValue={settings.name} className={inputClass} required /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Organisation slug</span><input name="slug" defaultValue={settings.slug} className={inputClass} required /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Project ID prefix</span><input name="projectNumberPrefix" defaultValue={settings.projectNumberPrefix} className={inputClass} required /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Currency</span><select name="currency" defaultValue={settings.currency} className={inputClass}><option value="AUD">AUD — Australian dollar</option><option value="NZD">NZD — New Zealand dollar</option><option value="USD">USD — US dollar</option><option value="GBP">GBP — British pound</option></select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Timezone</span><input name="timezone" defaultValue={settings.timezone} className={inputClass} required /></label>
          </div>
          <div className="rounded-xl border border-dashed border-border-strong bg-surface-muted/40 p-3">
            <p className="text-xs font-bold text-muted-foreground">Organisation logo</p>
            <div className="mt-3 grid aspect-square place-items-center overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-sm">
              {settings.logoUrl ? <Image src={settings.logoUrl} alt={`${settings.name} logo`} width={160} height={160} className="max-h-full max-w-full object-contain p-3" /> : <Building2 className="size-10 text-primary" />}
            </div>
            <label className="mt-3 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-xs font-bold transition hover:border-primary hover:text-primary"><ImagePlus className="size-4" /> Upload logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" /></label>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">PNG, JPG, WebP or SVG · max 2 MB</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3 sm:px-5"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save organisation"}</Button>{state.message ? <p className={state.ok ? "text-xs text-[var(--tone-emerald-fg)]" : "text-xs text-[var(--tone-rose-fg)]"}>{state.message}</p> : null}{isDemo ? <p className="ml-auto text-xs text-muted-foreground">Saved locally for testing only</p> : null}</div>
      </Card>
    </form>
  );
}
