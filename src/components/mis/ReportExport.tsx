import React from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import type { MisColumn } from './MisKit';
import { exportReportPDF } from '../../lib/reportPdf';
import { exportToCSV } from '../../lib/excelExporter';

/** Cell text for exports — uses `text()` when supplied, otherwise a primitive render value. */
function cellText<T>(col: MisColumn<T>, row: T): string {
  if (col.text) return col.text(row);
  const v = col.render(row);
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}

export function buildExportData<T>(columns: MisColumn<T>[], rows: T[]) {
  const cols = columns.filter((c) => c.key !== 'action');
  return {
    headers: cols.map((c) => c.label),
    rows: rows.map((r) => cols.map((c) => cellText(c, r))),
  };
}

/** PDF + CSV download buttons for any MisTable-driven report. */
export function ReportExportButtons<T>({
  title,
  columns,
  rows,
  subtitle,
  meta,
}: {
  title: string;
  columns: MisColumn<T>[];
  rows: T[];
  subtitle?: string;
  meta?: [string, string][];
}) {
  const disabled = rows.length === 0;

  const pdf = () => {
    const { headers, rows: body } = buildExportData(columns, rows);
    exportReportPDF({ title, headers, rows: body, subtitle, meta });
  };

  const csv = () => {
    const { headers, rows: body } = buildExportData(columns, rows);
    exportToCSV(title, headers, body);
  };

  const base =
    'inline-flex h-8 items-center gap-1.5 rounded px-3 text-[11px] font-bold text-white disabled:opacity-40';

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={pdf} disabled={disabled} title="Download PDF" className={`${base} bg-chetu-red hover:opacity-90`}>
        <FileDown className="h-3.5 w-3.5" />
        PDF
      </button>
      <button type="button" onClick={csv} disabled={disabled} title="Download Excel (CSV)" className={`${base} bg-emerald-600 hover:bg-emerald-700`}>
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Excel
      </button>
    </div>
  );
}
