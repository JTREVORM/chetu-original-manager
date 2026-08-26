import React from 'react';
import { FileText } from 'lucide-react';
import { PageHeader } from '../../components/mobile/Responsive';

interface BlankReportProps {
  title: string;
  subtitle?: string;
}

/**
 * Intentionally blank report canvas. Layout, filters and columns will be
 * defined later per report.
 */
export const BlankReport: React.FC<BlankReportProps> = ({ title, subtitle }) => {
  return (
    <div className="space-y-6 pb-12">
      <PageHeader icon={FileText} title={title} subtitle={subtitle ?? 'This report is not designed yet.'} />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-card min-h-[420px]" />
    </div>
  );
};
