import jsPDFCtor from "jspdf";
import type jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";

// jspdf-autotable ships as a UMD bundle whose default export is not reliably
// callable through Vite's CJS interop. Registering the plugin on the jsPDF
// prototype and calling doc.autoTable() is the interop-safe path.
type AutoTableFn = (doc: jsPDF, options: Record<string, unknown>) => void;

applyPlugin(jsPDFCtor as unknown as Parameters<typeof applyPlugin>[0]);

export const autoTable: AutoTableFn = (doc, options) => {
  (doc as unknown as { autoTable: (o: Record<string, unknown>) => void }).autoTable(options);
};

export default autoTable;
