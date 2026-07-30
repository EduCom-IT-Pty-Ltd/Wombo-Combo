import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { getProject, getQuote, getQuoteDocumentTemplateSettings } from "@/lib/data/repository";
import { formatMoney } from "@/lib/domain/money";
import { calculateQuote } from "@/lib/domain/quote";
import type { QuoteDocumentTemplateSettings, QuoteDynamicField } from "@/lib/data/types";

export const runtime = "nodejs";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;

function escapeXml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] ?? character); }
function wrap(value: string, width: number, fontSize: number) { const length = Math.max(8, Math.floor(width / (fontSize * 0.52))); const words = value.split(/\s+/); const lines: string[] = []; let line = ""; for (const word of words) { if (`${line} ${word}`.trim().length > length && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); } if (line) lines.push(line); return lines.slice(0, 3); }

function pdfFromJpeg(jpeg: Buffer, width: number, height: number) {
  const content = Buffer.from("q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n");
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("endstream")]),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from("\nendstream")]),
  ];
  let output = Buffer.from("%PDF-1.4\n");
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) { offsets.push(output.length); output = Buffer.concat([output, Buffer.from(`${index + 1} 0 obj\n`), objects[index], Buffer.from("\nendobj\n")]); }
  const start = output.length;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.concat([output, Buffer.from(xref)]);
}

function fieldValues(field: QuoteDynamicField, input: { reference: string; projectTitle: string; projectNumber: string; customerName: string; customerContact: string; siteAddress: string; total: string }) {
  const values: Record<QuoteDynamicField, string> = { quote_reference: input.reference, quote_date: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date()), project_name: input.projectTitle, project_number: input.projectNumber, customer_name: input.customerName, customer_contact: input.customerContact, site_address: input.siteAddress, quote_total: input.total };
  return values[field];
}

function quoteOverlay(settings: QuoteDocumentTemplateSettings, quote: Awaited<ReturnType<typeof getQuote>>, project: NonNullable<Awaited<ReturnType<typeof getProject>>>) {
  if (!quote) return "";
  const totals = calculateQuote(quote.lines, quote.taxRatePct);
  const values = { reference: quote.reference, projectTitle: project.title, projectNumber: project.projectNumber, customerName: project.customerName, customerContact: project.customer.primaryContactName ?? "", siteAddress: project.site ? [project.site.address, project.site.suburb, project.site.state, project.site.postcode].filter(Boolean).join(", ") : project.siteLabel ?? "", total: formatMoney(totals.totalCents) };
  const pieces: string[] = [];
  for (const field of settings.fields) {
    const x = (field.x / 100) * PAGE_WIDTH; const y = (field.y / 100) * PAGE_HEIGHT; const width = (field.width / 100) * PAGE_WIDTH;
    const lines = wrap(field.field === "plain_text" ? field.text?.trim() || "" : fieldValues(field.field, values), width, 23);
    pieces.push(`<text x="${x}" y="${y + 23}" font-family="Arial, sans-serif" font-size="23" font-weight="600" fill="#172033">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? 28 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`);
  }
  const x = (settings.table.x / 100) * PAGE_WIDTH; const y = (settings.table.y / 100) * PAGE_HEIGHT; const width = Math.min(((100 - settings.table.x) / 100) * PAGE_WIDTH, (settings.table.width / 100) * PAGE_WIDTH); const descWidth = width * 0.5; const qtyWidth = width * 0.15; const rateWidth = width * 0.17; const rowHeight = 42;
  pieces.push(`<rect x="${x}" y="${y}" width="${width}" height="${rowHeight}" fill="#182136"/><text x="${x + 12}" y="${y + 27}" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="white">Description</text><text x="${x + descWidth + qtyWidth - 10}" y="${y + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="white">Qty</text><text x="${x + descWidth + qtyWidth + rateWidth - 10}" y="${y + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="white">Rate</text><text x="${x + width - 10}" y="${y + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="white">Amount</text>`);
  let cursor = y + rowHeight;
  for (const line of totals.lines) {
    const description = wrap(line.description, descWidth - 20, 16)[0] ?? line.description;
    pieces.push(`<rect x="${x}" y="${cursor}" width="${width}" height="${rowHeight}" fill="#ffffff" fill-opacity="0.94" stroke="#cbd5e1"/><text x="${x + 12}" y="${cursor + 27}" font-family="Arial, sans-serif" font-size="16" fill="#172033">${escapeXml(description)}</text><text x="${x + descWidth + qtyWidth - 10}" y="${cursor + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#172033">${escapeXml(`${line.quantity} ${line.unit}`)}</text><text x="${x + descWidth + qtyWidth + rateWidth - 10}" y="${cursor + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#172033">${escapeXml(formatMoney(line.unitSellCents))}</text><text x="${x + width - 10}" y="${cursor + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#172033">${escapeXml(formatMoney(line.lineSellCents))}</text>`);
    cursor += rowHeight;
  }
  const summary: Array<[string, number]> = [["Subtotal", totals.subtotalSellCents], ["GST", totals.taxCents], ["Total", totals.totalCents]];
  for (const [label, value] of summary) { const bold = label === "Total"; pieces.push(`<rect x="${x + width * 0.54}" y="${cursor}" width="${width * 0.46}" height="${rowHeight}" fill="#ffffff" fill-opacity="0.96" stroke="#cbd5e1"/><text x="${x + width * 0.54 + 12}" y="${cursor + 27}" font-family="Arial, sans-serif" font-size="16" font-weight="${bold ? 700 : 400}" fill="#172033">${label}</text><text x="${x + width - 10}" y="${cursor + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="${bold ? 700 : 400}" fill="#172033">${formatMoney(value)}</text>`); cursor += rowHeight; }
  return `<svg width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${pieces.join("")}</svg>`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuote("local", id);
  if (!quote) return new Response("Quote not found", { status: 404 });
  const [project, settings] = await Promise.all([getProject("local", quote.projectId), getQuoteDocumentTemplateSettings("local")]);
  if (!project) return new Response("Project not found", { status: 404 });
  const overlays: Array<{ input: Buffer; top?: number; left?: number }> = [];
  if (settings.letterheadUrl?.startsWith("/uploads/")) {
    try { const artwork = await readFile(join(process.cwd(), "public", settings.letterheadUrl)); overlays.push({ input: await sharp(artwork).resize(PAGE_WIDTH, PAGE_HEIGHT, { fit: "fill" }).jpeg({ quality: 95 }).toBuffer(), top: 0, left: 0 }); } catch { /* A missing local upload should never stop a customer quote downloading. */ }
  }
  overlays.push({ input: Buffer.from(quoteOverlay(settings, quote, project)) });
  const jpeg = await sharp({ create: { width: PAGE_WIDTH, height: PAGE_HEIGHT, channels: 3, background: "#ffffff" } }).composite(overlays).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toBuffer();
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(pdfFromJpeg(jpeg, PAGE_WIDTH, PAGE_HEIGHT), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${quote.reference}.pdf"`, "Cache-Control": "no-store" } });
}
