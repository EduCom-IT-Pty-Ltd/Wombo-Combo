"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
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
  const term = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.primaryContactName, customer.accountType].some((value) =>
        value?.toLowerCase().includes(term),
      ),
    );
  }, [customers, term]);

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

      <Card>
        {matches.length ? (
          <ul className="divide-y divide-border-subtle">
            {matches.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/customers/${customer.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {/* Built by filtering rather than interpolating: a customer
                          from Xero has no account type, and a fixed separator
                          would leave the line starting with a stray dot. */}
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
                    {showFinancials ? (
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(customer.lifetimeValueCents, currency, { compact: true })}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{customer.paymentTermsDays} day terms</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={term ? "No matches" : archived ? "No archived customers" : "No customers yet"}
            description={
              term
                ? "Nothing matches that name. Check the spelling, or sync from Xero if they were added there recently."
                : undefined
            }
          />
        )}
      </Card>
    </div>
  );
}
