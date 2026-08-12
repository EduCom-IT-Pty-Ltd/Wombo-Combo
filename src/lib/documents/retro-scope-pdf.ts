import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont } from "pdf-lib";
import type { ProjectDetail } from "@/lib/data/types";
import type { RetroScopeRecord } from "@/lib/domain/retro-scope";
import type { PdfImage } from "./swms-pdf";

const W = 595.28; const H = 841.89; const M = 40;
const INK = rgb(0.08, 0.1, 0.14); const MUTED = rgb(0.36, 0.4, 0.47); const LINE = rgb(0.8, 0.83, 0.87); const PALE = rgb(0.95, 0.96, 0.98); const ACCENT = rgb(0.06, 0.34, 0.56);

export async function createRetroScopePdf({ project, record, logo, photos }: { project: ProjectDetail; record: RetroScopeRecord; logo: PdfImage | null; photos: PdfImage[] }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${project.projectNumber} Retrofit Scope`); pdf.setAuthor(record.values.assessedBy || project.customerName); pdf.setSubject("Retrofit assessment scope");
  const [regular, bold, embeddedLogo] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold), embedImage(pdf, logo)]);
  const page = pdf.addPage([W, H]);
  header(page, regular, bold, embeddedLogo, project);
  let y = H - 116;
  y = section(page, regular, bold, "Customer and property", y);
  y = detailGrid(page, regular, bold, [
    ["Name", record.values.customerName], ["Phone", record.values.phone],
    ["Email", record.values.email], ["Assessment date", formatDate(record.values.assessedOn)],
    ["Site address", record.values.address], ["Assessed by", record.values.assessedBy],
  ], y);
  y = section(page, regular, bold, "Assessment", y);
  y = detailGrid(page, regular, bold, [
    ["Spaces", record.values.spaces.join(", ")], ["Existing insulation", record.values.existingInsulation],
    ["Space condition", record.values.spaceCondition], ["Stud spacing", record.values.studSpacing],
    ["Roof type", record.values.roofType], ["Access point", record.values.accessPoint],
    ["Garage area", record.values.garageArea], ["House area", record.values.houseArea],
    ["New insulation rating", record.values.newInsulationRating], ["Removal type", record.values.removalType],
  ], y);
  y = section(page, regular, bold, "Assessment notes", y);
  noteBox(page, regular, record.values.notes || "No assessment notes recorded.", y, 150);
  footer(page, regular, project, 1, photos.length ? 2 : 1);
  if (photos.length) await photoPage(pdf, regular, bold, embeddedLogo, project, photos);
  return pdf.save({ useObjectStreams: true });
}

function header(page: ReturnType<PDFDocument["addPage"]>, regular: PDFFont, bold: PDFFont, logo: PDFImage | null, project: ProjectDetail) {
  page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: PALE }); page.drawRectangle({ x: 0, y: H - 78, width: 150, height: 78, color: rgb(1, 1, 1) }); page.drawRectangle({ x: 0, y: H - 78, width: 7, height: 78, color: ACCENT });
  if (logo) { const size = logo.scaleToFit(112, 52); page.drawImage(logo, { x: 19 + (112 - size.width) / 2, y: H - 66 + (52 - size.height) / 2, width: size.width, height: size.height }); }
  const titleX = logo ? 164 : M; page.drawText("RETROFIT ASSESSMENT SCOPE", { x: titleX, y: H - 35, size: 14, font: bold, color: INK }); page.drawText(clean(project.projectNumber), { x: titleX, y: H - 52, size: 8.5, font: regular, color: MUTED });
  page.drawText(clean(project.title), { x: W - M - 180, y: H - 35, size: 9, font: bold, color: ACCENT, maxWidth: 180 }); page.drawText(clean(project.customerName), { x: W - M - 180, y: H - 52, size: 8, font: regular, color: MUTED, maxWidth: 180 });
}

function section(page: ReturnType<PDFDocument["addPage"]>, _regular: PDFFont, bold: PDFFont, title: string, y: number) { page.drawText(title.toUpperCase(), { x: M, y, size: 10, font: bold, color: ACCENT }); return y - 16; }
function detailGrid(page: ReturnType<PDFDocument["addPage"]>, regular: PDFFont, bold: PDFFont, entries: Array<[string, string]>, y: number) { const width = (W - M * 2 - 12) / 2; for (let i = 0; i < entries.length; i += 2) { const cells = entries.slice(i, i + 2); const height = 43; cells.forEach(([label, value], index) => { const x = M + index * (width + 12); page.drawRectangle({ x, y: y - height, width, height, color: PALE, borderColor: LINE, borderWidth: 0.5 }); page.drawText(label.toUpperCase(), { x: x + 8, y: y - 11, size: 6.7, font: bold, color: MUTED }); wrapped(page, regular, clean(value || "-"), x + 8, y - 24, width - 16, 8.5, INK, 10, 2); }); y -= height + 8; } return y - 8; }
function noteBox(page: ReturnType<PDFDocument["addPage"]>, regular: PDFFont, text: string, y: number, height: number) { page.drawRectangle({ x: M, y: y - height, width: W - M * 2, height, color: PALE, borderColor: LINE, borderWidth: 0.5 }); wrapped(page, regular, clean(text), M + 10, y - 16, W - M * 2 - 20, 9, INK, 12, 10); }
async function photoPage(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, logo: PDFImage | null, project: ProjectDetail, photos: PdfImage[]) { const page = pdf.addPage([W, H]); header(page, regular, bold, logo, project); page.drawText("ASSESSMENT PHOTOS", { x: M, y: H - 116, size: 10, font: bold, color: ACCENT }); const cellW = (W - M * 2 - 12) / 2; const cellH = 230; for (let i = 0; i < Math.min(photos.length, 4); i += 1) { const image = await embedImage(pdf, photos[i]); if (!image) continue; const col = i % 2; const row = Math.floor(i / 2); const x = M + col * (cellW + 12); const y = H - 140 - row * (cellH + 14) - cellH; page.drawRectangle({ x, y, width: cellW, height: cellH, color: PALE, borderColor: LINE, borderWidth: 0.5 }); const size = image.scaleToFit(cellW - 12, cellH - 34); page.drawImage(image, { x: x + (cellW - size.width) / 2, y: y + 24 + (cellH - 34 - size.height) / 2, width: size.width, height: size.height }); page.drawText(clean(photos[i].name).slice(0, 70), { x: x + 6, y: y + 8, size: 7, font: regular, color: MUTED, maxWidth: cellW - 12 }); } footer(page, regular, project, 2, 2); }
function footer(page: ReturnType<PDFDocument["addPage"]>, regular: PDFFont, project: ProjectDetail, number: number, total: number) { page.drawLine({ start: { x: M, y: 28 }, end: { x: W - M, y: 28 }, thickness: 0.5, color: LINE }); page.drawText(`${clean(project.projectNumber)} | Retrofit scope`, { x: M, y: 16, size: 7.5, font: regular, color: MUTED }); page.drawText(`Page ${number} of ${total}`, { x: W - M - 44, y: 16, size: 7.5, font: regular, color: MUTED }); }
function wrapped(page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, value: string, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>, lineHeight: number, maxLines = Infinity) { const words = value.split(/\s+/).filter(Boolean); let line = ""; const lines: string[] = []; for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate; else { lines.push(line); line = word; } } if (line) lines.push(line); lines.slice(0, maxLines).forEach((item, index) => page.drawText(item, { x, y: y - index * lineHeight, size, font, color, maxWidth: width })); }
async function embedImage(pdf: PDFDocument, image: PdfImage | null): Promise<PDFImage | null> { if (!image) return null; try { const type = image.mimeType?.split(";", 1)[0]?.toLowerCase(); if (type === "image/png") return pdf.embedPng(image.bytes); if (type === "image/jpeg" || type === "image/jpg") return pdf.embedJpg(image.bytes); const sharp = (await import("sharp")).default; return pdf.embedPng(await sharp(image.bytes).png().toBuffer()); } catch { return null; } }
function clean(value: string) { return value.replace(/[\r\n]+/g, " ").replace(/[\u2013\u2014]/g, "-").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").trim(); }
function formatDate(value: string) { if (!value) return ""; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date); }
