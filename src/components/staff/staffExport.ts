/**
 * Exporting the staff register.
 *
 * All three formats take the rows the screen is currently showing, so an export
 * always matches what the person looking at it can see. An export that quietly
 * widened the selection would be worse than none at all — in a branch-scoped
 * institution it would be a leak.
 */
import { exportToCSV } from "../../lib/excelExporter";
import { exportReportPDF } from "../../lib/reportPdf";
import type { StaffDirectoryRow } from "./useStaffRegister";
import type { StaffFilters } from "./useStaffRegister";
import { shortDate } from "./StaffUi";

const HEADERS = [
  "Staff ID",
  "Full Name",
  "Role",
  "Primary Branch",
  "All Branches",
  "Phone",
  "Email",
  "Status",
  "Date Joined",
  "Last Login",
  "Failed Logins",
  "Business Day",
  "Officer Day",
];

const toRow = (staff: StaffDirectoryRow, branchName: (id: string) => string): string[] => [
  staff.staff_code || "",
  staff.full_name,
  staff.role,
  staff.primary_branch_name ||
    (staff.role === "Administrator" || staff.role === "Auditor" ? "Institution-wide" : ""),
  (staff.branch_ids || []).map(branchName).join("; "),
  staff.phone_number || "",
  staff.email || "",
  staff.status,
  staff.date_joined ? shortDate(staff.date_joined) : "",
  staff.last_login_at ? new Date(staff.last_login_at).toLocaleString("en-GB") : "Never",
  String(staff.failed_login_attempts ?? 0),
  staff.role === "Loan Officer"
    ? (staff.business_day_status || "NOT OPENED").replace(/_/g, " ")
    : "",
  staff.role === "Loan Officer" ? (staff.officer_day_status || "LOCKED").replace(/_/g, " ") : "",
];

/** The filters in force, printed on the export so it can be read months later. */
const describeFilters = (
  filters: StaffFilters,
  branchName: (id: string) => string,
): [string, string][] => {
  const meta: [string, string][] = [];
  if (filters.search.trim()) meta.push(["Search", filters.search.trim()]);
  meta.push(["Role", filters.role]);
  meta.push([
    "Branch",
    filters.branch === "All"
      ? "All Branches"
      : filters.branch === "__none"
        ? "Not attached"
        : branchName(filters.branch),
  ]);
  meta.push(["Status", filters.status]);
  meta.push([
    "Last login",
    {
      all: "All Time",
      today: "Today",
      "7d": "Last 7 Days",
      "30d": "Last 30 Days",
      never: "Never Logged In",
    }[filters.lastLogin],
  ]);
  return meta;
};

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A SpreadsheetML workbook, which Excel and LibreOffice both open natively.
 * No dependency, and unlike a renamed CSV it carries a styled header row and
 * keeps a staff number like "ST-00023" as text rather than guessing at it.
 */
const downloadSpreadsheet = (fileName: string, headers: string[], rows: string[][]) => {
  const headerCells = headers
    .map((h) => `<Cell ss:StyleID="head"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join("");
  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`,
    )
    .join("");

  const xml =
    `<?xml version="1.0"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="head">` +
    `<Font ss:Bold="1" ss:Color="#FFFFFF"/>` +
    `<Interior ss:Color="#0B4394" ss:Pattern="Solid"/>` +
    `</Style></Styles>` +
    `<Worksheet ss:Name="Staff"><Table><Row>${headerCells}</Row>${bodyRows}</Table></Worksheet>` +
    `</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export async function exportStaff(
  format: "excel" | "csv" | "pdf",
  rows: StaffDirectoryRow[],
  filters: StaffFilters,
  branchName: (id: string) => string,
  generatedBy: string,
) {
  const stamp = new Date().toISOString().split("T")[0];
  const data = rows.map((row) => toRow(row, branchName));

  if (format === "csv") {
    exportToCSV("Chetu_Staff_Register", HEADERS, data);
    return;
  }

  if (format === "excel") {
    downloadSpreadsheet(`Chetu_Staff_Register_${stamp}.xls`, HEADERS, data);
    return;
  }

  // The PDF drops the two columns that only carry meaning on screen, so the
  // remaining ones stay readable across a landscape page.
  const pdfHeaders = HEADERS.filter((h) => h !== "All Branches" && h !== "Failed Logins");
  const pdfRows = data.map((row) =>
    row.filter((_, i) => HEADERS[i] !== "All Branches" && HEADERS[i] !== "Failed Logins"),
  );

  await exportReportPDF({
    title: "Staff Register",
    subtitle: "Staff accounts, roles, branch assignments and system access",
    headers: pdfHeaders,
    rows: pdfRows,
    meta: describeFilters(filters, branchName),
    totals: [["Staff in this export", String(rows.length)]],
    generatedBy,
    orientation: "landscape",
    fileName: `Chetu_Staff_Register_${stamp}.pdf`,
  });
}
