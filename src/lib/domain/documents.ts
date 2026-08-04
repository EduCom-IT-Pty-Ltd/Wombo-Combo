import type { DocumentKind } from "@/lib/db/schema/enums";

/**
 * The largest file that can be uploaded through the app.
 *
 * Set by Graph, whose simple upload stops at 4 MB and wants a resumable session
 * past that — and matched by `serverActions.bodySizeLimit`, since the bytes are
 * relayed through the server. It lives here rather than with the SharePoint
 * client so the upload form can refuse an oversized file before sending it: over
 * the body limit the request never reaches the action, and the framework's
 * rejection says nothing useful.
 */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/**
 * How each kind of document is labelled in the app.
 *
 * Typed as a total record of the schema enum, so adding a kind to the database
 * without giving it a label here is a compile error rather than a raw
 * `completion_certificate` appearing on a page. The import is type-only: this
 * module is read by client components and must not pull drizzle into the bundle.
 */
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  drawing: "Drawing",
  swms: "SWMS",
  permit: "Permit",
  certificate: "Certificate",
  photo: "Photo",
  purchase_order: "Purchase order",
  quote_pdf: "Quote",
  completion_certificate: "Completion certificate",
  other: "Other",
};

/** Ordered for the upload picker — the two most common first, `other` last. */
export const DOCUMENT_KIND_OPTIONS: DocumentKind[] = [
  "drawing",
  "swms",
  "permit",
  "certificate",
  "photo",
  "purchase_order",
  "quote_pdf",
  "completion_certificate",
  "other",
];

export function documentKindLabel(kind: string): string {
  return DOCUMENT_KIND_LABELS[kind as DocumentKind] ?? kind;
}
