import { boolean, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";
import { lineKindEnum, quoteStatusEnum } from "./enums";
import { projects } from "./projects";

export const suppliers = pgTable(
  "suppliers",
  {
    ...orgScoped,
    name: text("name").notNull(),
    /**
     * Spec calls out "EU pricing" — imported stock is quoted in the supplier's
     * currency and converted at the rate captured on the quote line, so a later
     * FX move never silently rewrites an issued quote.
     */
    currency: text("currency").notNull().default("AUD"),
    leadTimeDays: integer("lead_time_days"),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("suppliers_org_name_idx").on(t.orgId, t.name)],
);

/** Admin module: reusable pricing tables. */
export const priceListItems = pgTable(
  "price_list_items",
  {
    ...orgScoped,
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Selectable product variant, e.g. "Aero 1200" under "Enviroseal Wall Wrap". */
    variation: text("variation"),
    description: text("description"),
    kind: lineKindEnum("kind").notNull().default("material"),
    unit: text("unit").notNull().default("ea"),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    /** Buy price in the supplier's currency. */
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    costCurrency: text("cost_currency").notNull().default("AUD"),
    /** Default margin applied when the item is pulled into a quote, as a percent. */
    defaultMarginPct: numeric("default_margin_pct", { precision: 6, scale: 3 }).notNull().default("30"),
    /**
     * Sell price, when it is a number in its own right rather than a margin on
     * cost. Null falls back to deriving it from `defaultMarginPct`.
     *
     * Xero items need this: a sales price there has no arithmetic relationship
     * to the purchase price, and plenty of them have a sell price and no cost at
     * all. Margin cannot express that — on a zero cost it is either zero or
     * infinite — so the price has to be stored rather than derived.
     */
    unitSellCents: integer("unit_sell_cents"),
    /**
     * The Xero item this row mirrors. Its presence is what makes it safe to send
     * `ItemCode` on a quote or invoice line: Xero rejects a code it does not
     * know, so a locally-invented SKU must not be sent as one.
     */
    xeroItemId: text("xero_item_id"),
    /**
     * The revenue account this item is coded to in Xero, so a line billed from
     * it lands where the bookkeeper puts it rather than in one catch-all.
     *
     * Null is common — an item is allowed to have no sales account — and those
     * lines fall back to the organisation's configured revenue account. Sending
     * no account at all is not an option: Xero rejects an invoice line that has
     * neither its own account nor one on the item.
     */
    xeroSalesAccountCode: text("xero_sales_account_code"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("price_list_items_org_code_idx").on(t.orgId, t.code)],
);

/** Labour rates by role/shift — the other half of an estimate. */
export const labourRates = pgTable(
  "labour_rates",
  {
    ...orgScoped,
    name: text("name").notNull(),
    /** What it costs us per hour. */
    costRateCentsPerHour: integer("cost_rate_cents_per_hour").notNull().default(0),
    /** What we bill per hour. */
    chargeRateCentsPerHour: integer("charge_rate_cents_per_hour").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("labour_rates_org_idx").on(t.orgId, t.name)],
);

/**
 * Quotes are versioned, never edited in place once sent. Revising an issued
 * quote creates version N+1 and marks N `superseded`, so the history the
 * customer saw is always recoverable.
 */
export const quotes = pgTable(
  "quotes",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    status: quoteStatusEnum("status").notNull().default("draft"),
    reference: text("reference").notNull(),

    /** Cached totals — recomputed from lines on every write. */
    subtotalCostCents: integer("subtotal_cost_cents").notNull().default(0),
    subtotalSellCents: integer("subtotal_sell_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    marginCents: integer("margin_cents").notNull().default(0),
    marginPct: numeric("margin_pct", { precision: 6, scale: 3 }).notNull().default("0"),

    taxRatePct: numeric("tax_rate_pct", { precision: 6, scale: 3 }).notNull().default("10"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    terms: text("terms"),

    preparedByUserId: uuid("prepared_by_user_id"),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    pdfDocumentId: uuid("pdf_document_id"),

    /**
     * The quote's counterpart in Xero, once it has been pushed there.
     *
     * Held on the quote rather than in a side table because it is one-to-one and
     * because every question worth asking — has this been sent, what number did
     * the customer see, did the last push fail — is asked while looking at the
     * quote.
     */
    xeroQuoteId: text("xero_quote_id"),
    xeroQuoteNumber: text("xero_quote_number"),
    /** Xero's own status: DRAFT, SENT, ACCEPTED, INVOICED, DECLINED, DELETED. */
    xeroQuoteStatus: text("xero_quote_status"),
    xeroSyncedAt: timestamp("xero_synced_at", { withTimezone: true }),
    /** Set when a push fails, cleared on the next success. */
    xeroLastError: text("xero_last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("quotes_org_project_version_idx").on(t.orgId, t.projectId, t.version),
    index("quotes_org_status_idx").on(t.orgId, t.status),
  ],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    ...orgScoped,
    quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    kind: lineKindEnum("kind").notNull().default("material"),
    // `price_list_item_id` is what carries a line back to its catalogue material,
    // and through that to the Xero item code the line should be billed under.
    priceListItemId: uuid("price_list_item_id").references(() => priceListItems.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ea"),

    /** Cost side, in the source currency, plus the rate used to convert it. */
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    costCurrency: text("cost_currency").notNull().default("AUD"),
    fxRate: numeric("fx_rate", { precision: 12, scale: 6 }).notNull().default("1"),

    marginPct: numeric("margin_pct", { precision: 6, scale: 3 }).notNull().default("0"),
    /** Sell price in org currency. Derived from cost+margin unless overridden. */
    unitSellCents: integer("unit_sell_cents").notNull().default(0),
    isOverride: boolean("is_override").notNull().default(false),

    lineCostCents: integer("line_cost_cents").notNull().default(0),
    lineSellCents: integer("line_sell_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("quote_lines_org_quote_idx").on(t.orgId, t.quoteId, t.sortOrder)],
);
