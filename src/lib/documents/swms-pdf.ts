import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type { ProjectDetail } from "@/lib/data/types";
import type { SwmsRecord, SwmsTemplate } from "@/lib/domain/swms";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 38;
const TOP = 102;
const BOTTOM = 42;
const INK = rgb(0.08, 0.1, 0.14);
const MUTED = rgb(0.36, 0.4, 0.47);
const LINE = rgb(0.8, 0.83, 0.87);
const PALE = rgb(0.95, 0.96, 0.98);
const ACCENT = rgb(0.06, 0.34, 0.56);
const TICK = rgb(0.06, 0.48, 0.27);
// The SWMS is a field document, not a photo archive. Keeping the embedded
// copies below this budget gives a sharp A4 printout while keeping the file
// comfortably below the 2 MB sharing limit in normal use.
const PHOTO_EMBED_BUDGET_BYTES = 1_350_000;

export type PdfImage = { name: string; mimeType: string | null; bytes: Uint8Array };

export interface SwmsPdfInput {
  project: ProjectDetail;
  template: SwmsTemplate;
  record: SwmsRecord;
  logo: PdfImage | null;
  photos: PdfImage[];
}

type Writer = {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  project: ProjectDetail;
  page: PDFPage;
  y: number;
  section: string;
};

/**
 * A compact, static SWMS suitable for signing, sharing and filing. It mirrors
 * the existing in-platform form rather than attempting to imitate a browser
 * screenshot, so each page remains clear in print and on a phone.
 */
export async function createSwmsPdf(input: SwmsPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.project.projectNumber} SWMS`);
  pdf.setAuthor(input.project.customerName);
  pdf.setSubject("Safe Work Method Statement");

  const [regular, bold, preparedLogo, photos] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    prepareLogoForPdf(input.logo),
    preparePhotosForPdf(input.photos),
  ]);
  const logo = await embedImage(pdf, preparedLogo);
  const writer = createWriter(pdf, regular, bold, logo, input.project, "Project details");
  const { values } = input.record;

  drawSectionTitle(writer, "Project details", input.template.mandatoryNotice);
  drawDetails(writer, [
    ["Sales order", values.salesOrder], ["Prepared", dateTime(values.preparedAt)],
    ["Builder", values.builder], ["Principal", values.principal],
    ["Site address", [values.siteAddress, values.suburb].filter(Boolean).join(", ")], ["Lead installer", values.leadInstaller],
  ]);
  drawRule(writer);
  drawChecklistAndReference(writer, input.template, input.record);
  drawSiteReport(writer, input.template, input.record);

  addPage(writer, "Safety analysis");
  drawSectionTitle(writer, "Safety analysis", "Review each task, identify present hazards and confirm the control measures in place.");
  drawSafetyTable(writer, input.template, input.record);
  drawNotes(writer, "Hazard notes", values.hazardNotes || "No additional hazard notes recorded.");

  addPage(writer, "Measurements and sign-off");
  drawSectionTitle(writer, "Site notes and installer sign-off", "Record the measurements and site conditions used to complete this work safely.");
  drawMeasurements(writer, input.record);
  drawNotes(writer, "Comments", values.comments || "No additional comments recorded.");
  drawSignOff(writer, input.record);

  await drawPhotoPages(writer, input.template, input.record, photos);
  addPageNumbers(writer);
  return pdf.save({ useObjectStreams: true });
}

function createWriter(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, logo: PDFImage | null, project: ProjectDetail, section: string): Writer {
  const writer = { pdf, regular, bold, logo, project, page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - TOP, section };
  drawHeader(writer);
  return writer;
}

function addPage(writer: Writer, section: string) {
  writer.page = writer.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  writer.y = PAGE_HEIGHT - TOP;
  writer.section = section;
  drawHeader(writer);
}

function drawHeader(writer: Writer) {
  const { page, regular, bold, logo, project, section } = writer;
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 76, width: PAGE_WIDTH, height: 76, color: PALE });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 76, width: 7, height: 76, color: ACCENT });
  let titleX = MARGIN;
  if (logo) {
    const size = logo.scaleToFit(58, 42);
    page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - 60, width: size.width, height: size.height });
    titleX += 70;
  }
  page.drawText("SAFE WORK METHOD STATEMENT", { x: titleX, y: PAGE_HEIGHT - 34, size: 14, font: bold, color: INK });
  page.drawText(clean(section), { x: titleX, y: PAGE_HEIGHT - 51, size: 8.5, font: regular, color: MUTED });
  page.drawText(clean(project.projectNumber), { x: PAGE_WIDTH - MARGIN - 110, y: PAGE_HEIGHT - 34, size: 9, font: bold, color: ACCENT, maxWidth: 110 });
  page.drawText(clean(project.title), { x: PAGE_WIDTH - MARGIN - 180, y: PAGE_HEIGHT - 51, size: 7.5, font: regular, color: MUTED, maxWidth: 180 });
}

function addPageNumbers(writer: Writer) {
  const pages = writer.pdf.getPages();
  pages.forEach((page, index) => {
    page.drawLine({ start: { x: MARGIN, y: 28 }, end: { x: PAGE_WIDTH - MARGIN, y: 28 }, thickness: 0.5, color: LINE });
    page.drawText(`${writer.project.projectNumber}  |  SWMS`, { x: MARGIN, y: 16, size: 7.5, font: writer.regular, color: MUTED });
    const label = `Page ${index + 1} of ${pages.length}`;
    page.drawText(label, { x: PAGE_WIDTH - MARGIN - writer.regular.widthOfTextAtSize(label, 7.5), y: 16, size: 7.5, font: writer.regular, color: MUTED });
  });
}

function ensureSpace(writer: Writer, height: number, section = writer.section) {
  if (writer.y - height < BOTTOM) addPage(writer, section);
}

function drawSectionTitle(writer: Writer, title: string, detail?: string) {
  ensureSpace(writer, detail ? 48 : 30, title);
  writer.page.drawText(clean(title), { x: MARGIN, y: writer.y, size: 14, font: writer.bold, color: INK });
  writer.y -= 18;
  if (detail) {
    writer.y = drawWrapped(writer, clean(detail), MARGIN, writer.y, PAGE_WIDTH - MARGIN * 2, 8.5, writer.regular, MUTED, 11) - 5;
  }
  writer.y -= 5;
}

function drawRule(writer: Writer) {
  writer.page.drawLine({ start: { x: MARGIN, y: writer.y }, end: { x: PAGE_WIDTH - MARGIN, y: writer.y }, thickness: 0.7, color: LINE });
  writer.y -= 14;
}

function drawDetails(writer: Writer, entries: Array<[string, string]>) {
  const columnWidth = (PAGE_WIDTH - MARGIN * 2 - 14) / 2;
  for (let index = 0; index < entries.length; index += 2) {
    const row = entries.slice(index, index + 2);
    const lineCounts = row.map(([, value]) => wrap(clean(value || "-"), columnWidth - 16, 9, writer.regular).length);
    const height = Math.max(40, Math.max(...lineCounts) * 10 + 25);
    ensureSpace(writer, height + 8);
    const rowY = writer.y;
    row.forEach(([label, value], itemIndex) => {
      const x = MARGIN + itemIndex * (columnWidth + 14);
      writer.page.drawRectangle({ x, y: rowY - height, width: columnWidth, height, color: PALE, borderColor: LINE, borderWidth: 0.5 });
      writer.page.drawText(clean(label).toUpperCase(), { x: x + 8, y: rowY - 9, size: 6.8, font: writer.bold, color: MUTED });
      drawWrapped(writer, clean(value || "-"), x + 8, rowY - 21, columnWidth - 16, 9, writer.regular, INK, 10);
    });
    writer.y -= height + 8;
  }
  writer.y -= 2;
}

function drawChecklistAndReference(writer: Writer, template: SwmsTemplate, record: SwmsRecord) {
  ensureSpace(writer, 160, "Project details");
  const mid = MARGIN + (PAGE_WIDTH - MARGIN * 2) * 0.52;
  writer.page.drawText("SCOPE OF WORK", { x: MARGIN, y: writer.y, size: 9, font: writer.bold, color: ACCENT });
  writer.page.drawText("QUICK REFERENCE", { x: mid, y: writer.y, size: 9, font: writer.bold, color: ACCENT });
  writer.y -= 15;
  const startY = writer.y;
  template.scopeItems.forEach((item, index) => {
    const row = index % 6;
    const col = Math.floor(index / 6);
    drawCheckbox(writer, MARGIN + col * 125, startY - row * 18, record.values.scope[item.id] ?? false, item.label);
  });
  if (record.values.repairNotes) drawCheckbox(writer, MARGIN + 125, startY - 4 * 18, true, `Repair: ${record.values.repairNotes}`);
  template.quickReference.forEach((item, index) => {
    const y = startY - index * 13;
    writer.page.drawText(`${index + 1}.`, { x: mid, y, size: 7.3, font: writer.bold, color: ACCENT });
    drawWrapped(writer, item, mid + 13, y, PAGE_WIDTH - MARGIN - mid - 13, 7.3, writer.regular, INK, 9);
  });
  writer.y = Math.min(startY - 6 * 18, startY - template.quickReference.length * 13) - 13;
}

function drawSiteReport(writer: Writer, template: SwmsTemplate, record: SwmsRecord) {
  ensureSpace(writer, 192, "Project details");
  writer.page.drawText("SITE REPORT", { x: MARGIN, y: writer.y, size: 9, font: writer.bold, color: ACCENT });
  writer.y -= 16;
  const available = PAGE_WIDTH - MARGIN * 2;
  const columnWidth = available / 3;
  const startY = writer.y;
  template.siteReportItems.forEach((item, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    drawCheckbox(writer, MARGIN + column * columnWidth, startY - row * 17, record.values.siteReport[item.id] ?? false, item.label, columnWidth - 5, 7.2);
  });
  const rows = Math.ceil(template.siteReportItems.length / 3);
  writer.y = startY - rows * 17 - 6;
  drawCheckbox(writer, MARGIN, writer.y, record.values.powerIsolated, "Power isolated and tagged");
  drawCheckbox(writer, MARGIN + 180, writer.y, record.values.powerRestored, "Power restored");
  writer.y -= 20;
  if (record.values.otherSiteReport) drawNotes(writer, "Other site report notes", record.values.otherSiteReport);
}

function drawSafetyTable(writer: Writer, template: SwmsTemplate, record: SwmsRecord) {
  const columns = [92, 108, 42, 230, 42];
  const headers = ["Task", "Hazard / risk", "Present", "Control measures", "Controlled"];
  drawTableHeader(writer, columns, headers);
  for (const item of template.hazards) {
    const present = record.values.hazards[item.id]?.present ?? false;
    const controlled = record.values.hazards[item.id]?.controlled ?? false;
    const lineCounts = [
      wrap(item.task, columns[0] - 10, 7.2, writer.regular).length,
      wrap(item.hazard, columns[1] - 10, 7.2, writer.regular).length,
      1,
      wrap(item.controls, columns[3] - 10, 7.2, writer.regular).length,
      1,
    ];
    const height = Math.max(27, Math.max(...lineCounts) * 9 + 10);
    if (writer.y - height < BOTTOM) { addPage(writer, "Safety analysis"); drawTableHeader(writer, columns, headers); }
    let x = MARGIN;
    const cells = [item.task, item.hazard, "", item.controls, ""];
    cells.forEach((cell, index) => {
      writer.page.drawRectangle({ x, y: writer.y - height, width: columns[index], height, borderColor: LINE, borderWidth: 0.45 });
      if (index === 2 || index === 4) drawTableCheck(writer, x + columns[index] / 2 - 5, writer.y - height / 2 + 3, index === 2 ? present : controlled);
      else drawWrapped(writer, cell, x + 5, writer.y - 10, columns[index] - 10, 7.2, writer.regular, INK, 9);
      x += columns[index];
    });
    writer.y -= height;
  }
  writer.y -= 12;
}

function drawTableHeader(writer: Writer, columns: number[], headers: string[]) {
  ensureSpace(writer, 28, "Safety analysis");
  let x = MARGIN;
  headers.forEach((header, index) => {
    writer.page.drawRectangle({ x, y: writer.y - 23, width: columns[index], height: 23, color: ACCENT });
    drawWrapped(writer, header, x + 4, writer.y - 9, columns[index] - 8, 6.5, writer.bold, rgb(1, 1, 1), 8);
    x += columns[index];
  });
  writer.y -= 23;
}

function drawMeasurements(writer: Writer, record: SwmsRecord) {
  const entries: Array<[string, string]> = [
    ["GF walls", record.values.studWidths.gfWalls], ["FF walls", record.values.studWidths.ffWalls],
    ["Ceiling spacing", record.values.studWidths.ceilingSpacing], ["Sub floor", record.values.studWidths.subFloor],
    ["Mid floor", record.values.studWidths.midFloor], ["Job status", record.values.jobStatus],
  ];
  writer.page.drawText("MEASUREMENTS", { x: MARGIN, y: writer.y, size: 9, font: writer.bold, color: ACCENT });
  writer.y -= 14;
  drawDetails(writer, entries);
}

function drawNotes(writer: Writer, title: string, value: string) {
  const lines = wrap(value, PAGE_WIDTH - MARGIN * 2 - 16, 8.5, writer.regular);
  const height = Math.max(49, lines.length * 11 + 28);
  ensureSpace(writer, height, writer.section);
  writer.page.drawRectangle({ x: MARGIN, y: writer.y - height, width: PAGE_WIDTH - MARGIN * 2, height, color: PALE, borderColor: LINE, borderWidth: 0.5 });
  writer.page.drawText(clean(title).toUpperCase(), { x: MARGIN + 8, y: writer.y - 12, size: 7, font: writer.bold, color: MUTED });
  drawWrapped(writer, value, MARGIN + 8, writer.y - 25, PAGE_WIDTH - MARGIN * 2 - 16, 8.5, writer.regular, INK, 11);
  writer.y -= height + 12;
}

function drawSignOff(writer: Writer, record: SwmsRecord) {
  ensureSpace(writer, 136, "Measurements and sign-off");
  writer.page.drawText("INSTALLER SIGN-OFF", { x: MARGIN, y: writer.y, size: 9, font: writer.bold, color: ACCENT });
  writer.y -= 17;
  const names = record.values.installerNames.filter(Boolean);
  const rows = Math.max(4, names.length);
  const nameWidth = 252;
  const signatureX = MARGIN + nameWidth + 16;
  const signatureWidth = PAGE_WIDTH - MARGIN - signatureX;
  writer.page.drawRectangle({ x: MARGIN, y: writer.y - 17, width: nameWidth, height: 17, color: PALE, borderColor: LINE, borderWidth: 0.5 });
  writer.page.drawRectangle({ x: signatureX, y: writer.y - 17, width: signatureWidth, height: 17, color: PALE, borderColor: LINE, borderWidth: 0.5 });
  writer.page.drawText("INSTALLER", { x: MARGIN + 6, y: writer.y - 11, size: 6.8, font: writer.bold, color: MUTED });
  writer.page.drawText("SIGNATURE", { x: signatureX + 6, y: writer.y - 11, size: 6.8, font: writer.bold, color: MUTED });
  writer.y -= 17;
  for (let index = 0; index < rows; index += 1) {
    const y = writer.y - index * 23;
    writer.page.drawRectangle({ x: MARGIN, y: y - 23, width: nameWidth, height: 23, borderColor: LINE, borderWidth: 0.5 });
    writer.page.drawRectangle({ x: signatureX, y: y - 23, width: signatureWidth, height: 23, borderColor: LINE, borderWidth: 0.5 });
    writer.page.drawText(clean(names[index] || ""), { x: MARGIN + 6, y: y - 15, size: 8.5, font: writer.regular, color: INK });
  }
  writer.y -= rows * 23 + 15;
  writer.page.drawText(`Time out: ${clean(record.values.timeOut || "-")}`, { x: MARGIN, y: writer.y, size: 8.5, font: writer.bold, color: INK });
  writer.y -= 22;
}

async function drawPhotoPages(writer: Writer, template: SwmsTemplate, record: SwmsRecord, photos: PdfImage[]) {
  addPage(writer, "Photo record");
  drawSectionTitle(writer, "Photo record", "Checklist and supporting site photos linked to this SWMS.");
  const checklistRows = Math.ceil(template.photoChecklist.length / 2);
  template.photoChecklist.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawCheckbox(writer, MARGIN + column * 250, writer.y - row * 18, record.values.photoChecklist[item.id] ?? false, item.label, 235);
  });
  writer.y -= checklistRows * 18 + 10;
  if (record.values.photoNotes) drawNotes(writer, "Photo notes", record.values.photoNotes);

  if (photos.length === 0) {
    drawNotes(writer, "Supporting photos", "No photos were attached to this SWMS at the time of export.");
    return;
  }
  writer.page.drawText("SUPPORTING PHOTOS", { x: MARGIN, y: writer.y, size: 9, font: writer.bold, color: ACCENT });
  writer.y -= 15;
  let slot = 0;
  for (const photo of photos) {
    const image = await embedImage(writer.pdf, photo);
    if (!image) continue;
    const cellWidth = (PAGE_WIDTH - MARGIN * 2 - 12) / 2;
    const cellHeight = 160;
    if (writer.y - cellHeight < BOTTOM) { addPage(writer, "Photo record"); writer.page.drawText("SUPPORTING PHOTOS (CONTINUED)", { x: MARGIN, y: writer.y, size: 9, font: writer.bold, color: ACCENT }); writer.y -= 15; slot = 0; }
    const column = slot % 2;
    if (column === 0 && slot > 0) writer.y -= cellHeight + 12;
    const x = MARGIN + column * (cellWidth + 12);
    const y = writer.y - cellHeight;
    writer.page.drawRectangle({ x, y, width: cellWidth, height: cellHeight, color: PALE, borderColor: LINE, borderWidth: 0.5 });
    const bounds = image.scaleToFit(cellWidth - 12, cellHeight - 34);
    writer.page.drawImage(image, { x: x + (cellWidth - bounds.width) / 2, y: y + 23 + (cellHeight - 34 - bounds.height) / 2, width: bounds.width, height: bounds.height });
    writer.page.drawText(truncate(clean(photo.name), cellWidth - 12, 6.8, writer.regular), { x: x + 6, y: y + 7, size: 6.8, font: writer.regular, color: MUTED, maxWidth: cellWidth - 12 });
    slot += 1;
  }
}

async function prepareLogoForPdf(logo: PdfImage | null): Promise<PdfImage | null> {
  if (!logo || logo.bytes.byteLength <= 180_000) return logo;
  try {
    const sharp = (await import("sharp")).default;
    const bytes = await sharp(logo.bytes)
      .resize({ width: 480, height: 240, fit: "inside", withoutEnlargement: true })
      .png({ palette: true, quality: 85, compressionLevel: 9 })
      .toBuffer();
    return { ...logo, mimeType: "image/png", bytes: new Uint8Array(bytes) };
  } catch {
    return logo;
  }
}

async function preparePhotosForPdf(photos: PdfImage[]): Promise<PdfImage[]> {
  if (photos.length === 0) return [];
  const perPhotoBudget = Math.max(18_000, Math.floor(PHOTO_EMBED_BUDGET_BYTES / photos.length));
  const prepared = await Promise.all(photos.map((photo) => compressPhotoForPdf(photo, perPhotoBudget)));
  return prepared.filter((photo): photo is PdfImage => photo !== null);
}

async function compressPhotoForPdf(photo: PdfImage, byteBudget: number): Promise<PdfImage | null> {
  try {
    const sharp = (await import("sharp")).default;
    const source = sharp(photo.bytes, { limitInputPixels: false }).rotate();
    const profiles = [
      { edge: 1_000, quality: 72 },
      { edge: 760, quality: 62 },
      { edge: 560, quality: 52 },
      { edge: 420, quality: 42 },
    ];
    for (const profile of profiles) {
      const bytes = await source.clone()
        .resize({ width: profile.edge, height: profile.edge, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: profile.quality, progressive: true, mozjpeg: true, chromaSubsampling: "4:2:0" })
        .toBuffer();
      if (bytes.byteLength <= byteBudget || profile === profiles.at(-1)) {
        // A very unusual high-detail image could still exceed the quota at the
        // smallest practical size. Omit it rather than allowing one photo to
        // make the SWMS too large to email or share from site.
        if (bytes.byteLength > byteBudget) return null;
        return { ...photo, mimeType: "image/jpeg", bytes: new Uint8Array(bytes) };
      }
    }
  } catch {
    // A bad image should never stop the signed SWMS being generated.
  }
  return null;
}

async function embedImage(pdf: PDFDocument, image: PdfImage | null): Promise<PDFImage | null> {
  if (!image) return null;
  try {
    const type = image.mimeType?.split(";", 1)[0]?.toLowerCase();
    if (type === "image/png") return pdf.embedPng(image.bytes);
    if (type === "image/jpeg" || type === "image/jpg") return pdf.embedJpg(image.bytes);
    // Organisation branding accepts SVG and WebP as well. Next already ships
    // Sharp for server-side image work; use it here to keep the PDF faithful to
    // the configured logo rather than silently replacing it with a placeholder.
    const sharp = (await import("sharp")).default;
    return pdf.embedPng(await sharp(image.bytes).png().toBuffer());
  } catch {
    // An unusable logo or photo must not prevent the legally useful SWMS from
    // being filed. It is simply omitted from this export.
  }
  return null;
}

function drawCheckbox(writer: Writer, x: number, y: number, checked: boolean, label: string, width = 150, size = 7.5) {
  writer.page.drawRectangle({ x, y: y - 8, width: 8, height: 8, borderColor: checked ? TICK : MUTED, borderWidth: 0.8, color: checked ? TICK : rgb(1, 1, 1) });
  if (checked) writer.page.drawText("x", { x: x + 1.2, y: y - 7, size: 7, font: writer.bold, color: rgb(1, 1, 1) });
  drawWrapped(writer, label, x + 12, y, width - 12, size, writer.regular, INK, size + 1.5);
}

function drawTableCheck(writer: Writer, x: number, y: number, checked: boolean) {
  writer.page.drawRectangle({ x, y, width: 10, height: 10, borderColor: checked ? TICK : MUTED, borderWidth: 0.9, color: checked ? TICK : rgb(1, 1, 1) });
  if (checked) writer.page.drawText("x", { x: x + 1.4, y: y + 1, size: 8, font: writer.bold, color: rgb(1, 1, 1) });
}

function drawWrapped(writer: Writer, text: string, x: number, y: number, width: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, lineHeight: number) {
  const lines = wrap(text, width, size, font);
  lines.forEach((line, index) => writer.page.drawText(line, { x, y: y - index * lineHeight, size, font, color, maxWidth: width }));
  return y - lines.length * lineHeight;
}

function wrap(text: string, width: number, size: number, font: PDFFont): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function clean(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function truncate(value: string, width: number, size: number, font: PDFFont): string {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let shortened = value;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}...`, size) > width) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
