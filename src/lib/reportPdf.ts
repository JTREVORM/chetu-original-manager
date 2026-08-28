import jsPDF from "jspdf";
import { autoTable } from "./autoTable";

export interface ReportPdfOptions {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  /** The window the report covers, e.g. "01 Jan 2026 to 31 Jan 2026". */
  period?: string;
  /** Free-text line under the title, when a period does not describe it. */
  subtitle?: string;
  /** Key/value pairs printed in the header band — filters, rates, basis. */
  meta?: [string, string][];
  /** Right-aligned totals printed under the table. */
  totals?: [string, string][];
  /** Who ran it, printed in the footer for accountability. */
  generatedBy?: string;
  orientation?: "portrait" | "landscape";
  fileName?: string;
}

const NAVY: [number, number, number] = [11, 67, 148];
const AMBER: [number, number, number] = [245, 166, 35];
const SLATE: [number, number, number] = [71, 85, 105];
const MUTED: [number, number, number] = [148, 163, 184];

/**
 * The institution mark, fetched once and reused. Loading it must never be able
 * to stop a report downloading, so a failure simply yields no logo.
 */
let logoPromise: Promise<string | null> | null = null;
function loadLogo(): Promise<string | null> {
  if (logoPromise) return logoPromise;
  logoPromise = (async () => {
    try {
      const res = await fetch("/icon-192.png");
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  return logoPromise;
}

/**
 * Renders any tabular report as a branded PDF and downloads it.
 *
 * Every page carries the institution mark, the report title, the period it
 * covers and the moment it was generated — a printed report that cannot say
 * what it covers or when it was run is not evidence of anything.
 */
export async function exportReportPDF({
  title,
  headers,
  rows,
  period,
  subtitle,
  meta,
  totals,
  generatedBy,
  orientation = "landscape",
  fileName,
}: ReportPdfOptions): Promise<void> {
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logo = await loadLogo();

  const now = new Date();
  const generatedOn = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const generatedAt = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const HEADER_H = 26;

  const drawHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, HEADER_H, "F");
    doc.setFillColor(...AMBER);
    doc.rect(0, HEADER_H, pageWidth, 1.2, "F");

    let textLeft = 12;
    if (logo) {
      // White tile behind the mark, matching how it appears in the app.
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(11, 5.5, 15, 15, 2, 2, "F");
      try {
        doc.addImage(logo, "PNG", 12.2, 6.7, 12.6, 12.6);
      } catch {
        /* a broken image must not stop the report */
      }
      textLeft = 30;
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("CHETU MICROFINANCE LTD", textLeft, 12);

    doc.setFontSize(10.5);
    doc.setTextColor(255, 214, 140);
    doc.text(title.toUpperCase(), textLeft, 18.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(206, 222, 245);
    if (period) doc.text(`Period: ${period}`, textLeft, 23.2);
    else if (subtitle) doc.text(subtitle, textLeft, 23.2);

    // Right-hand block: when it was run, and how much it covers.
    doc.setFontSize(7.6);
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated ${generatedOn}`, pageWidth - 12, 10.5, { align: "right" });
    doc.setTextColor(206, 222, 245);
    doc.text(`at ${generatedAt}`, pageWidth - 12, 15, { align: "right" });
    doc.text(`${rows.length} record${rows.length === 1 ? "" : "s"}`, pageWidth - 12, 19.5, {
      align: "right",
    });
    if (generatedBy) doc.text(`by ${generatedBy}`, pageWidth - 12, 24, { align: "right" });
  };

  let startY = HEADER_H + 6;

  if (meta?.length) {
    doc.setFillColor(241, 245, 249);
    doc.rect(10, startY - 3.4, pageWidth - 20, 6.6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text(meta.map(([k, v]) => `${k}: ${v}`).join("     •     "), 12, startY + 0.9);
    startY += 8;
  }

  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
    startY,
    styles: {
      fontSize: 6.9,
      cellPadding: 1.5,
      overflow: "linebreak",
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 6.9,
      cellPadding: 2,
    },
    alternateRowStyles: { fillColor: [247, 250, 253] },
    margin: { left: 10, right: 10, top: HEADER_H + 6, bottom: 16 },
    // Redrawn on every page so a page torn from the report still identifies itself.
    didDrawPage: drawHeader,
  });

  if (totals?.length) {
    const afterTable =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
    let y = afterTable + 6;
    if (y > pageHeight - 24) {
      doc.addPage();
      drawHeader();
      y = HEADER_H + 12;
    }
    doc.setFillColor(241, 245, 249);
    doc.rect(pageWidth - 92, y - 4.6, 82, 6 + totals.length * 4.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(...NAVY);
    doc.text("TOTALS", pageWidth - 88, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SLATE);
    totals.forEach(([label, value], i) => {
      const ty = y + 4.8 + i * 4.6;
      doc.text(label, pageWidth - 88, ty);
      doc.setFont("helvetica", "bold");
      doc.text(value, pageWidth - 14, ty, { align: "right" });
      doc.setFont("helvetica", "normal");
    });
  }

  // Page numbering has to run last — the total is only known once every page exists.
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.2);
    doc.line(10, pageHeight - 10, pageWidth - 10, pageHeight - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("Chetu Microfinance Ltd — confidential, system generated", 12, pageHeight - 6);
    doc.text(`${generatedOn} ${generatedAt}`, pageWidth / 2, pageHeight - 6, { align: "center" });
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 12, pageHeight - 6, { align: "right" });
  }

  const stamp = `${now.toISOString().split("T")[0]}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const name = (fileName || title).replace(/[^\w]+/g, "_");
  doc.save(`${name}_${stamp}.pdf`);
}
