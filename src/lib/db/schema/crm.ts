import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";

export const customers = pgTable(
  "customers",
  {
    ...orgScoped,
    name: text("name").notNull(),
    /** Builder, head contractor, direct residential, etc. Free-text by design. */
    accountType: text("account_type"),
    abn: text("abn"),
    billingAddress: text("billing_address"),
    paymentTermsDays: text("payment_terms_days"),
    /** Xero ContactID once synced. */
    xeroContactId: text("xero_contact_id"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("customers_org_name_idx").on(t.orgId, t.name)],
);

export const contacts = pgTable(
  "contacts",
  {
    ...orgScoped,
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("contacts_org_customer_idx").on(t.orgId, t.customerId)],
);

/** A physical location work is performed at. One customer, many sites. */
export const sites = pgTable(
  "sites",
  {
    ...orgScoped,
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    suburb: text("suburb"),
    state: text("state"),
    postcode: text("postcode"),
    country: text("country").notNull().default("AU"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    /** Induction requirements, gate codes, parking — surfaced to the field app. */
    accessNotes: text("access_notes"),
    ...timestamps,
  },
  (t) => [index("sites_org_customer_idx").on(t.orgId, t.customerId)],
);

/** Spec: "communication history". Email/call/SMS/meeting log against a customer or project. */
export const communications = pgTable(
  "communications",
  {
    ...orgScoped,
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    direction: text("direction").notNull().default("outbound"),
    subject: text("subject"),
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    loggedByUserId: uuid("logged_by_user_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("communications_org_customer_idx").on(t.orgId, t.customerId, t.occurredAt),
    index("communications_org_project_idx").on(t.orgId, t.projectId, t.occurredAt),
  ],
);
