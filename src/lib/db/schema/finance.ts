import { index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";
import { invoiceStatusEnum } from "./enums";
import { projects } from "./projects";
import { quotes } from "./quoting";

/**
 * Snapshot of final costing, written when the project enters `final_costing`
 * and recomputed until it leaves. Storing it rather than deriving on read means
 * historical profitability stays stable after rates and prices move.
 */
export const projectCostings = pgTable(
  "project_costings",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

    quotedSellCents: integer("quoted_sell_cents").notNull().default(0),
    quotedCostCents: integer("quoted_cost_cents").notNull().default(0),

    actualLabourCostCents: integer("actual_labour_cost_cents").notNull().default(0),
    actualLabourHours: numeric("actual_labour_hours", { precision: 12, scale: 2 }).notNull().default("0"),
    actualMaterialCostCents: integer("actual_material_cost_cents").notNull().default(0),
    variationSellCents: integer("variation_sell_cents").notNull().default(0),
    variationCostCents: integer("variation_cost_cents").notNull().default(0),

    totalRevenueCents: integer("total_revenue_cents").notNull().default(0),
    totalCostCents: integer("total_cost_cents").notNull().default(0),
    grossProfitCents: integer("gross_profit_cents").notNull().default(0),
    grossMarginPct: numeric("gross_margin_pct", { precision: 6, scale: 3 }).notNull().default("0"),

    finalisedByUserId: uuid("finalised_by_user_id"),
    finalisedAt: timestamp("finalised_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("project_costings_org_project_idx").on(t.orgId, t.projectId)],
);

/** Purchase orders received from the customer against an approved quote. */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    poNumber: text("po_number").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    documentId: uuid("document_id"),
    recordedByUserId: uuid("recorded_by_user_id"),
    ...timestamps,
  },
  (t) => [index("purchase_orders_org_project_idx").on(t.orgId, t.projectId)],
);

/**
 * We do not issue invoices — Xero does. This row is the export handle: what we
 * pushed, when, and what Xero gave back.
 */
export const invoiceExports = pgTable(
  "invoice_exports",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /**
     * The quote this was billed from. Nullable and `set null` on delete: the
     * record of what was invoiced has to outlive the quote it came from.
     */
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    status: invoiceStatusEnum("status").notNull().default("pending_export"),
    amountCents: integer("amount_cents").notNull().default(0),
    /** Serialised line items as sent, so a Xero-side edit is still traceable. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    xeroInvoiceId: text("xero_invoice_id"),
    xeroInvoiceNumber: text("xero_invoice_number"),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [index("invoice_exports_org_project_idx").on(t.orgId, t.projectId, t.status)],
);
