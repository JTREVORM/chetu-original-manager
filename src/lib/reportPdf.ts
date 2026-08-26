import jsPDF from 'jspdf';
import { autoTable } from './autoTable';

export interface ReportPdfOptions {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  /** e.g. "From 2026-01-01 to 2026-01-31" */
  subtitle?: string;
  /** Optional key/value chips printed under the subtitle. */
  meta?: [string, string][];
  orientation?: 'portrait' | 'landscape';
  fileName?: string;
}

/** Renders any tabular report as a branded PDF and triggers a download. */
export function exportReportPDF({
  title,
  headers,
  rows,
  subtitle,
  meta,
  orientation = 'landscape',
  fileName,
}: ReportPdfOptions) {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(11, 67, 148);
  doc.rect(0, 0, pageWidth, 8, 'F');
  doc.setFillColor(245, 166, 35);
  doc.rect(0, 8, pageWidth, 1.6, 'F');

  doc.setTextColor(11, 67, 148);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CHETU MICROFINANCE LTD', 12, 19);

  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(title.toUpperCase(), 12, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  if (subtitle) doc.text(subtitle, 12, 31.5);
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - 12, 19, { align: 'right' });
  doc.text(`Records: ${rows.length}`, pageWidth - 12, 24, { align: 'right' });

  let startY = subtitle ? 35 : 31;
  if (meta?.length) {
    doc.text(meta.map(([k, v]) => `${k}: ${v}`).join('   |   '), 12, startY);
    startY += 4.5;
  }

  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))),
    startY,
    styles: { fontSize: 7.2, cellPadding: 1.4, overflow: 'linebreak', textColor: [51, 65, 85] },
    headStyles: { fillColor: [11, 67, 148], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    alternateRowStyles: { fillColor: [246, 249, 253] },
    margin: { left: 10, right: 10, bottom: 14 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Chetu Microfinance Ltd — system generated report', 12, h - 6);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 12, h - 6, { align: 'right' });
    },
  });

  const name = (fileName || title).replace(/[^\w]+/g, '_');
  doc.save(`${name}_${new Date().toISOString().split('T')[0]}.pdf`);
}
