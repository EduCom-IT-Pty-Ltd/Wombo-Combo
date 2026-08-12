import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont } from "pdf-lib";
import type { ProjectDetail } from "@/lib/data/types";
import type { PdfImage } from "./swms-pdf";

const W = 595.28;
const H = 841.89;
const M = 48;
const INK = rgb(0.07, 0.09, 0.13);
const MUTED = rgb(0.34, 0.39, 0.47);
const LINE = rgb(0.78, 0.82, 0.87);
const PALE = rgb(0.95, 0.97, 0.99);
const ACCENT = rgb(0.08, 0.33, 0.56);

/** A fixed compliance certificate; project details and issue reference are inserted at export. */
export async function createComplianceCertificatePdf(input: {
  project: ProjectDetail;
  header: PdfImage;
  issuedAt: Date;
  certificateReference: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.project.projectNumber} Certificate of Compliance`);
  pdf.setAuthor("EnviroShield Insulation");
  pdf.setSubject("Certificate of compliance");

  const [regular, bold, header] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    embedImage(pdf, input.header),
  ]);
  if (!header) throw new Error("The configured certificate header is not a supported image.");

  const page = pdf.addPage([W, H]);
  const headerSize = header.scaleToFit(W, 249);
  page.drawImage(header, { x: (W - headerSize.width) / 2, y: H - headerSize.height, width: headerSize.width, height: headerSize.height });

  let y = H - headerSize.height - 38;
  page.drawText("CERTIFICATE OF COMPLIANCE", { x: M, y, size: 17, font: bold, color: ACCENT });
  y -= 27;
  page.drawText("Insulation installation", { x: M, y, size: 9.5, font: regular, color: MUTED });
  y -= 28;

  const address = [input.project.site?.address ?? input.project.siteLabel ?? "", input.project.site?.suburb, input.project.site?.state, input.project.site?.postcode].filter(Boolean).join(", ");
  y = detailGrid(page, regular, bold, [
    ["Project", input.project.title], ["Project reference", input.project.projectNumber],
    ["Customer", input.project.customerName], ["Site address", address || "Not recorded"],
    ["Installation completed", formatDate(input.project.installationCompletedAt) || "Not recorded"], ["Certificate issued", formatDate(input.issuedAt.toISOString())],
  ], y);

  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: LINE });
  y -= 27;
  const body = "I Michael Stempinski as an Independent contractor, certify that the insulation installed on this project complies with the NCC 2022, AS/NZS 4859.1:2018, AS 1530.3-1999 and the product manufacturer's recommendations and specifications as stated on the product data sheet.\n\nEnviroShield Insulation";
  y = paragraph(page, regular, body, M, y, W - M * 2, 10.5, INK, 16);
  y -= 23;
  page.drawText("Certified by", { x: M, y, size: 8, font: bold, color: MUTED });
  page.drawText("Michael Stempinski", { x: M, y: y - 18, size: 11, font: bold, color: INK });
  page.drawText("Independent contractor", { x: M, y: y - 33, size: 8.5, font: regular, color: MUTED });

  const integrityY = 83;
  page.drawRectangle({ x: M, y: integrityY, width: W - M * 2, height: 43, color: PALE, borderColor: LINE, borderWidth: 0.5 });
  page.drawText("CERTIFICATE REFERENCE", { x: M + 10, y: integrityY + 28, size: 6.5, font: bold, color: MUTED });
  page.drawText(input.certificateReference, { x: M + 10, y: integrityY + 15, size: 9, font: bold, color: INK });
  page.drawText("Recorded in the EnviroShield project document register.", { x: M + 165, y: integrityY + 15, size: 7.5, font: regular, color: MUTED, maxWidth: W - M * 2 - 175 });

  page.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.5, color: LINE });
  page.drawText(`${input.project.projectNumber} | Certificate of compliance`, { x: M, y: 28, size: 7.5, font: regular, color: MUTED });
  page.drawText("Page 1 of 1", { x: W - M - 40, y: 28, size: 7.5, font: regular, color: MUTED });
  return pdf.save({ useObjectStreams: true });
}

function detailGrid(page: ReturnType<PDFDocument["addPage"]>, regular: PDFFont, bold: PDFFont, entries: Array<[string, string]>, y: number) {
  const width = (W - M * 2 - 12) / 2;
  for (let i = 0; i < entries.length; i += 2) {
    const cells = entries.slice(i, i + 2);
    const height = 46;
    cells.forEach(([label, value], index) => {
      const x = M + index * (width + 12);
      page.drawRectangle({ x, y: y - height, width, height, color: PALE, borderColor: LINE, borderWidth: 0.5 });
      page.drawText(label.toUpperCase(), { x: x + 9, y: y - 12, size: 6.8, font: bold, color: MUTED });
      wrapped(page, regular, clean(value), x + 9, y - 26, width - 18, 8.8, INK, 10.5, 2);
    });
    y -= height + 8;
  }
  return y;
}

function paragraph(page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, value: string, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>, lineHeight: number) {
  const paragraphs = value.split("\n");
  for (const item of paragraphs) {
    if (!item) { y -= lineHeight; continue; }
    const lines = linesFor(font, clean(item), width, size);
    lines.forEach((line) => { page.drawText(line, { x, y, size, font, color, maxWidth: width }); y -= lineHeight; });
  }
  return y;
}

function wrapped(page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, value: string, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>, lineHeight: number, maxLines: number) {
  linesFor(font, value, width, size).slice(0, maxLines).forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, size, font, color, maxWidth: width }));
}

function linesFor(font: PDFFont, value: string, width: number, size: number) {
  const lines: string[] = []; let line = "";
  for (const word of value.split(/\s+/).filter(Boolean)) { const candidate = line ? `${line} ${word}` : word; if (!line || font.widthOfTextAtSize(candidate, size) <= width) line = candidate; else { lines.push(line); line = word; } }
  if (line) lines.push(line);
  return lines;
}

async function embedImage(pdf: PDFDocument, image: PdfImage): Promise<PDFImage | null> {
  try {
    // This banner never renders wider than one A4 page. A compact PNG keeps its
    // clean lettering and gradients sharp without embedding a full camera-size
    // source image in every certificate.
    const sharp = (await import("sharp")).default;
    const compact = await sharp(image.bytes)
      .resize({ width: 1600, height: 700, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    return pdf.embedPng(compact);
  } catch { return null; }
}

function clean(value: string) { return value.replace(/[\r\n]+/g, " ").replace(/[\u2013\u2014]/g, "-").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").trim(); }
function formatDate(value: string | null) { if (!value) return ""; const date = new Date(value.includes("T") ? value : `${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date); }
