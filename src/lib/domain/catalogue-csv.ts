/**
 * The material catalogue as a CSV.
 *
 * Export only. The catalogue is mirrored from Xero's items, so there is nothing
 * to read a file back into — a CSV that could write materials would be a second
 * way for the catalogue to disagree with the accounting system, which is the
 * problem the Xero sync exists to solve. This file is for taking the catalogue
 * somewhere else: a spreadsheet, an email, a price review.
 */

/** Column headings, in the order the export writes them. */
export const CSV_HEADINGS = ["name", "variation", "sku", "description", "cost_per_m2", "standard_price_per_m2"];
