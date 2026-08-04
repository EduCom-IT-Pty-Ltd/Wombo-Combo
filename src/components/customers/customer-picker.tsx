"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

/**
 * A type-to-filter customer field.
 *
 * A plain `<select>` was fine with a dozen accounts and is unusable now that the
 * list is mirrored from Xero — scrolling several hundred options to find one
 * builder is not a thing anyone should do on a phone in a site office.
 *
 * The whole list arrives as a prop and filtering happens here rather than on the
 * server. `listCustomerOptions` is three columns, so even a few thousand
 * customers is a small payload, and it buys instant results with no round trip
 * per keystroke — which matters most exactly where the connection is worst.
 */

export interface CustomerOption {
  id: string;
  name: string;
  defaultProjectTemplateId?: string | null;
}

/**
 * Rendering every match would put thousands of nodes in the document the moment
 * the field is focused. Nobody reads past the first screen of a filtered list,
 * so the rest is cost with no benefit — but the count is shown, because
 * silently truncating would let someone conclude their customer is missing.
 */
const MAX_VISIBLE = 50;

export function CustomerPicker({
  customers,
  name = "customerId",
  label = "Customer",
  defaultCustomerId,
  required = false,
  hint,
  error,
  onSelect,
}: {
  customers: CustomerOption[];
  name?: string;
  label?: string;
  defaultCustomerId?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  onSelect?: (customer: CustomerOption | null) => void;
}) {
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState(defaultCustomerId ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selected = customers.find((customer) => customer.id === selectedId) ?? null;
  const term = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!term) return customers;
    return customers.filter((customer) => customer.name.toLowerCase().includes(term));
  }, [customers, term]);
  const visible = matches.slice(0, MAX_VISIBLE);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function choose(customer: CustomerOption) {
    setSelectedId(customer.id);
    setQuery("");
    setOpen(false);
    onSelect?.(customer);
    // Returned to the field so the next Tab goes where the person expects, not
    // back to the top of the form.
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (visible.length ? (current + step + visible.length) % visible.length : 0));
      return;
    }
    if (event.key === "Enter" && open) {
      // Only swallow Enter when it is choosing something. Otherwise it stays the
      // key that submits the form.
      const choice = visible[highlight];
      if (choice) {
        event.preventDefault();
        choose(choice);
      }
    }
  }

  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div ref={wrapper} className="relative">
        <input type="hidden" name={name} value={selectedId} />
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required}
          // Closed, the field reads as the chosen customer. Open, it is a search
          // box — so typing filters instead of having to clear the name first.
          value={open ? query : (selected?.name ?? "")}
          placeholder={customers.length ? "Search customers…" : "No customers yet"}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlight(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          // 16px on phones because iOS zooms the page for anything smaller;
          // back to the 14px of its neighbouring fields from `sm` up.
          className={`h-11 w-full rounded-[var(--radius)] border ${error ? "border-[var(--tone-rose-fg)]" : "border-border-strong"} bg-surface pr-9 pl-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary sm:text-sm`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close customer list" : "Open customer list"}
          onClick={() => {
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-0 grid h-11 w-9 -translate-y-1/2 place-items-center text-muted-foreground"
        >
          <ChevronsUpDown className="size-4" />
        </button>

        {open ? (
          <div
            id={listId}
            role="listbox"
            className="absolute top-[calc(100%+0.25rem)] left-0 z-50 max-h-72 w-full overflow-y-auto overscroll-contain rounded-xl border border-border-strong bg-surface shadow-2xl"
          >
            {visible.map((customer, index) => (
              <button
                key={customer.id}
                type="button"
                role="option"
                aria-selected={customer.id === selectedId}
                // Mouse down rather than click: the blur that a click fires
                // first closes the list, and the click then lands on nothing.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(customer);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  index === highlight ? "bg-surface-muted" : ""
                }`}
              >
                <Check
                  className={`size-4 shrink-0 ${customer.id === selectedId ? "text-primary" : "invisible"}`}
                />
                <span className="min-w-0 flex-1 truncate">{customer.name}</span>
              </button>
            ))}
            {matches.length > visible.length ? (
              <p className="border-t border-border-subtle px-3 py-2 text-xs text-muted-foreground">
                Showing {visible.length} of {matches.length}. Keep typing to narrow it down.
              </p>
            ) : null}
            {matches.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No customer matches “{query.trim()}”.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <span className="mt-1 block text-xs text-[var(--tone-rose-fg)]">{error}</span>
      ) : hint ? (
        <span className="mt-1 block min-h-4 text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}
