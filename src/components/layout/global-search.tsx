"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, MapPin, Search, Users } from "lucide-react";

export type GlobalSearchProject = { id: string; title: string; projectNumber: string; customerName: string; siteLabel: string | null };
export type GlobalSearchCustomer = { id: string; name: string; primaryContactName: string | null };

export function GlobalSearch({ projects, customers }: { projects: GlobalSearchProject[]; customers: GlobalSearchCustomer[] }) {
  const router = useRouter();
  const wrapper = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const term = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (term.length < 2) return { projects: [], customers: [] };
    return {
      projects: projects.filter((project) => [project.title, project.projectNumber, project.customerName, project.siteLabel].some((value) => value?.toLowerCase().includes(term))).slice(0, 6),
      customers: customers.filter((customer) => [customer.name, customer.primaryContactName].some((value) => value?.toLowerCase().includes(term))).slice(0, 4),
    };
  }, [customers, projects, term]);
  const firstResult = results.projects[0] ? `/projects/${results.projects[0].id}` : results.customers[0] ? `/customers/${results.customers[0].id}` : null;
  const hasResults = results.projects.length + results.customers.length > 0;

  useEffect(() => {
    function close(event: MouseEvent) { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  function go(href: string) { setOpen(false); setQuery(""); router.push(href); }

  return <div ref={wrapper} className="relative hidden max-w-sm flex-1 lg:block"><Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); setOpen(false); } else if (event.key === "Enter" && firstResult) go(firstResult); }} placeholder="Search projects, customers, sites…" className="h-9 w-full rounded-[var(--radius)] border border-border-subtle bg-surface-muted pr-3 pl-8 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary" />{open && term.length >= 2 ? <div className="absolute top-[calc(100%+0.5rem)] left-0 z-50 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="max-h-[min(28rem,calc(100vh-5rem))] overflow-y-auto">{results.projects.length ? <ResultGroup label="Projects">{results.projects.map((project) => <button type="button" key={project.id} onClick={() => go(`/projects/${project.id}`)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-muted text-primary"><FolderKanban className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{project.title}</span><span className="block truncate text-xs text-muted-foreground">{project.projectNumber} · {project.customerName}{project.siteLabel ? ` · ${project.siteLabel}` : ""}</span></span></button>)}</ResultGroup> : null}{results.customers.length ? <ResultGroup label="Customers">{results.customers.map((customer) => <button type="button" key={customer.id} onClick={() => go(`/customers/${customer.id}`)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-600"><Users className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{customer.name}</span><span className="block truncate text-xs text-muted-foreground">{customer.primaryContactName ?? "Customer"}</span></span></button>)}</ResultGroup> : null}{!hasResults ? <div className="px-4 py-6 text-center"><MapPin className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">No matches</p><p className="mt-1 text-xs text-muted-foreground">Try a project name, number, customer or site.</p></div> : null}</div></div> : null}</div>;
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) { return <div className="border-b border-border-subtle last:border-0"><p className="bg-surface-muted px-3 py-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>{children}</div>; }
