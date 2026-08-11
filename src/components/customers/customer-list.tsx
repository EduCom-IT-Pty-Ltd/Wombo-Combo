"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, List, Search } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import { Card, EmptyState } from "@/components/ui";
import type { Customer } from "@/lib/data/types";

/**
 * The customer list, with a filter box.
 *
 * Filtering client-side rather than through a `?q=` round trip: the page has
 * already loaded every row to count sites and projects, so the data is here
 * regardless, and typing gives results per keystroke instead of per request.
 *
 * Contact name is searchable as well as company name, because half the time the
 * only thing anyone remembers is who they have been emailing.
 */
export function CustomerList({
  customers,
  currency,
  showFinancials,
  archived,
}: {
  customers: Customer[];
  currency: string;
  showFinancials: boolean;
  archived: boolean;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const term = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.primaryContactName, customer.accountType].some((value) =>
        value?.toLowerCase().includes(term),
      ),
    );
  }, [customers, term]);

  const groups = useMemo(() => {
    const grouped = new Map<string, Customer[]>();
    for (const customer of matches) {
      const firstCharacter = customer.name.trim().charAt(0).toLocaleUpperCase();
      const initial = /^[A-Z]$/.test(firstCharacter) ? firstCharacter : "#";
      const group = grouped.get(initial) ?? [];
      group.push(customer);
      grouped.set(initial, group);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left === "#" ? 1 : right === "#" ? -1 : left.localeCompare(right))
      .map(([initial, group]) => [initial, group.sort((left, right) => left.name.localeCompare(right.name))] as const);
  }, [matches]);

  function toggleGroup(initial: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(initial)) next.delete(initial);
      else next.add(initial);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by customer, contact or account type…"
          aria-label="Search customers"
          // 16px on phones, or iOS zooms the page when it takes focus.
          className="h-11 w-full rounded-[var(--radius)] border border-border-strong bg-surface pr-3 pl-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary sm:text-sm"
        />
      </div>

      {term ? (
        <p className="text-xs text-muted-foreground">
          {matches.length} of {customers.length} {archived ? "archived " : ""}
          {customers.length === 1 ? "customer" : "customers"}
        </p>
      ) : null}

      {matches.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{term ? "Search results" : "Browse customers"}</p>
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
              aria-pressed={showAll}
            >
              <List className="size-4" />
              {showAll ? "Alphabetical groups" : "Show all"}
            </button>
          </div>

          {showAll ? (
            <Card><CustomerRows customers={matches} currency={currency} showFinancials={showFinancials} /></Card>
          ) : (
            <div className="space-y-2">
              {groups.map(([initial, group]) => {
                const open = term.length > 0 || openGroups.has(initial);
                return (
                  <Card key={initial} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(initial)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left transition hover:bg-surface-muted"
                      aria-expanded={open}
                    >
                      <span className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-surface-muted text-sm font-extrabold text-primary">{initial}</span><span className="font-semibold">{initial === "#" ? "Numbers & symbols" : `Customers beginning with ${initial}`}</span><span className="text-sm text-muted-foreground">{group.length}</span></span>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open ? <CustomerRows customers={group} currency={currency} showFinancials={showFinancials} /> : null}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <Card><EmptyState
          title={term ? "No matches" : archived ? "No archived customers" : "No customers yet"}
          description={
            term
              ? "Nothing matches that name. Check the spelling, or sync from Xero if they were added there recently."
              : undefined
          }
        /></Card>
      )}
    </div>
  );
}

function CustomerRows({ customers, currency, showFinancials }: { customers: Customer[]; currency: string; showFinancials: boolean }) {
  return <ul className="divide-y divide-border-subtle">
    {customers.map((customer) => (
      <li key={customer.id}>
        <Link
          href={`/customers/${customer.id}`}
          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-muted"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{customer.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[
                customer.accountType,
                `${customer.siteCount} ${customer.siteCount === 1 ? "site" : "sites"}`,
                `${customer.activeProjects} active`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {showFinancials ? <p className="text-sm font-semibold tabular-nums">{formatMoney(customer.lifetimeValueCents, currency, { compact: true })}</p> : null}
            <p className="text-xs text-muted-foreground">{customer.paymentTermsDays} day terms</p>
          </div>
        </Link>
      </li>
    ))}
  </ul>;
}
