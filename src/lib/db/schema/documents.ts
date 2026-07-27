import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";
import { documentKindEnum } from "./enums";

/**
 * Metadata only — bytes live in blob storage (Vercel Blob or S3). `storageKey`
 * is the object key; we never serve the provider URL directly so access can be
 * checked against the caller's org and role on every read.
 */
export const documents = pgTable(
  "documents",
  {
    ...orgScoped,
    projectId: uuid("project_id"),
    customerId: uuid("customer_id"),
    kind: documentKindEnum("kind").notNull().default("other"),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    version: integer("version").notNull().default(1),
    supersedesDocumentId: uuid("supersedes_document_id"),
    /** Documents an installer must acknowledge before clocking on (SWMS, permits). */
    requiresAcknowledgement: boolean("requires_acknowledgement").notNull().default(false),
    expiresOn: timestamp("expires_on", { withTimezone: true }),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("documents_org_project_idx").on(t.orgId, t.projectId, t.kind),
    index("documents_org_customer_idx").on(t.orgId, t.customerId),
  ],
);

export const documentAcknowledgements = pgTable(
  "document_acknowledgements",
  {
    ...orgScoped,
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("document_acks_org_doc_idx").on(t.orgId, t.documentId)],
);

/** Site photos. Kept separate from documents: they are high-volume and gridded. */
export const photos = pgTable(
  "photos",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull(),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    caption: text("caption"),
    /** `before` | `during` | `after` | `defect` | `qa` — drives gallery grouping. */
    stage: text("stage").notNull().default("during"),
    defectId: uuid("defect_id"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    ...timestamps,
  },
  (t) => [index("photos_org_project_idx").on(t.orgId, t.projectId, t.stage)],
);
