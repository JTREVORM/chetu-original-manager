import jsPDF from 'jspdf';
import { autoTable } from './autoTable';
import { formatUGX } from './loanCalculations';
import { loadPdfLogo } from './pdfLogo';
import { Client, Loan, LoanApplication, LoanRepayment, Expense, BankTransaction, SavingsTransaction } from '../types/database.types';

const V_NAVY: [number, number, number] = [11, 67, 148];
const V_AMBER: [number, number, number] = [245, 158, 11];
const V_SLATE: [number, number, number] = [71, 85, 105];
const V_MUTED: [number, number, number] = [148, 163, 184];
const V_RED: [number, number, number] = [211, 47, 47];
const V_GREEN: [number, number, number] = [4, 120, 87];

/**
 * Header for the two ledger vouchers (Expense, Bank Transaction) — carries
 * the actual logo.svg mark (rasterized once, see pdfLogo.ts) rather than
 * typed-out company text, matching how the sidebar presents the brand.
 */
async function drawVoucherHeader(doc: jsPDF, documentTitle: string, docNumber: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await loadPdfLogo();

  doc.setFillColor(...V_NAVY);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(...V_AMBER);
  doc.rect(0, 32, pageWidth, 1.4, 'F');

  // The address sits beside the logo tile, never beneath it — at this band
  // height text under the tile would run through the mark.
  let textLeft = 14;
  if (logo) {
    const tileH = 14;
    const tileW = tileH * (logo.width / logo.height);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 6, tileW + 4, tileH + 4, 2, 2, 'F');
    try {
      doc.addImage(logo.dataUrl, 'PNG', 14, 8, tileW, tileH);
    } catch {
      /* a broken image must not stop the voucher */
    }
    textLeft = 12 + tileW + 4 + 6;
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('CHETU MICROFINANCE LTD', 14, 14);
    textLeft = 14;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(206, 222, 245);
  doc.text('Plot 45 Kampala Road, P.O. Box 10294, Kampala, Uganda', textLeft, logo ? 14 : 21);
  doc.text('Tel: +256 700 123 456   |   info@chetumicrofinance.co.ug', textLeft, logo ? 19 : 26);

  // Document reference badge, top right.
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - 68, 6, 56, 20, 2.5, 2.5, 'F');
  doc.setTextColor(...V_RED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(documentTitle.toUpperCase(), pageWidth - 40, 13.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...V_SLATE);
  doc.setFontSize(8);
  doc.text(`Ref: ${docNumber}`, pageWidth - 40, 19, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(...V_MUTED);
  doc.text(
    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    pageWidth - 40,
    23.5,
    { align: 'center' },
  );
}

/** Y coordinate where the last autoTable finished, without an `any` cast. */
function lastTableEnd(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
}

/** A boxed, large-print amount — the figure a voucher exists to record. */
function drawAmountBox(doc: jsPDF, label: string, amount: number, y: number, tone: 'red' | 'green' | 'navy') {
  const pageWidth = doc.internal.pageSize.getWidth();
  const palette = {
    red: { bg: [254, 242, 242] as [number, number, number], border: V_RED, text: V_RED },
    green: { bg: [236, 253, 245] as [number, number, number], border: V_GREEN, text: V_GREEN },
    navy: { bg: [239, 246, 255] as [number, number, number], border: V_NAVY, text: V_NAVY },
  }[tone];

  doc.setFillColor(...palette.bg);
  doc.roundedRect(14, y, pageWidth - 28, 18, 2, 2, 'F');
  doc.setDrawColor(...palette.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, y, pageWidth - 28, 18, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...V_SLATE);
  doc.text(label.toUpperCase(), 20, y + 7);

  doc.setFontSize(16);
  doc.setTextColor(...palette.text);
  // formatUGX already carries the "UGX" prefix — do not add another.
  doc.text(formatUGX(amount), pageWidth - 20, y + 12.5, { align: 'right' });

  return y + 18;
}

/** Signature strip + confidentiality footer shared by both ledger vouchers. */
function drawVoucherFooter(doc: jsPDF, roles: [string, string, string]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const startY = pageHeight - 40;
  const cols: [number, number][] = [
    [14, 70],
    [pageWidth / 2 - 28, pageWidth / 2 + 28],
    [pageWidth - 70, pageWidth - 14],
  ];

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...V_SLATE);
  roles.forEach((role, i) => {
    const [x1, x2] = cols[i];
    doc.line(x1, startY, x2, startY);
    doc.text(role, x1, startY + 5);
    doc.text('Signature & Date', x1, startY + 9.5);
  });

  doc.setFillColor(248, 250, 252);
  doc.rect(0, pageHeight - 16, pageWidth, 16, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...V_MUTED);
  doc.text('Chetu Microfinance Ltd — confidential, system generated voucher.', pageWidth / 2, pageHeight - 9.5, { align: 'center' });
  const now = new Date();
  doc.text(
    `Printed ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' },
  );
}

// Helper to draw Chetu Microfinance Ltd header
function drawPDFHeader(doc: jsPDF, documentTitle: string, docNumber?: string) {
  // Top Banner Accent
  doc.setFillColor(11, 67, 148); // Chetu Primary Deep Blue (#0B4394)
  doc.rect(0, 0, 210, 8, 'F');
  doc.setFillColor(245, 158, 11); // Chetu Amber Gold Accent (#F59E0B)
  doc.rect(0, 8, 210, 2, 'F');

  // Company Name & Subtitle
  doc.setTextColor(11, 67, 148);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('CHETU MICROFINANCE LTD', 14, 22);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Head Office: Kampala Central | Tel: +256 700 123 456 | Email: info@chetumicrofinance.co.ug', 14, 28);
  doc.text('Plot 45 Kampala Road, P.O. Box 10294 Kampala, Uganda', 14, 33);

  // Document Badge
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(125, 14, 71, 22, 3, 3, 'F');
  doc.setDrawColor(11, 67, 148);
  doc.roundedRect(125, 14, 71, 22, 3, 3, 'D');

  doc.setTextColor(220, 38, 38);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(documentTitle.toUpperCase(), 160.5, 23, { align: 'center' });

  doc.setTextColor(11, 67, 148);
  doc.setFontSize(8.5);
  doc.text(docNumber ? `Ref: ${docNumber}` : `Date: ${new Date().toISOString().split('T')[0]}`, 160.5, 30, { align: 'center' });

  // Divider line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 40, 196, 40);
}

// Helper to draw PDFFooter & Signatures
function drawPDFFooter(doc: jsPDF, preparedBy: string = 'Loan Officer', approvedBy?: string) {
  const pageHeight = doc.internal.pageSize.height;
  const startY = pageHeight - 45;

  // Signature Boxes
  doc.setDrawColor(203, 213, 225);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  // Box 1: Prepared By
  doc.line(14, startY, 70, startY);
  doc.text(`Prepared By: ${preparedBy}`, 14, startY + 5);
  doc.text('Signature & Date', 14, startY + 10);

  // Box 2: Client Signature
  doc.line(80, startY, 130, startY);
  doc.text('Client Signature', 80, startY + 5);
  doc.text('Date & Thumbprint', 80, startY + 10);

  // Box 3: Approved By
  doc.line(140, startY, 196, startY);
  doc.text(`Approved By: ${approvedBy || 'Branch Manager'}`, 140, startY + 5);
  doc.text('Official Stamp & Date', 140, startY + 10);

  // Bottom Notice
  doc.setFillColor(248, 250, 252);
  doc.rect(0, pageHeight - 15, 210, 15, 'F');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Thank you for choosing Chetu Microfinance Ltd. Prompt repayments build a strong credit standing.',
    105,
    pageHeight - 6,
    { align: 'center' }
  );
}

// 1. Client Registration Form PDF
export function generateClientRegistrationPDF(client: Client) {
  const doc = new jsPDF();
  drawPDFHeader(doc, 'Client Profile Form', client.client_number);

  let y = 48;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 41, 98);
  doc.text('PERSONAL INFORMATION', 14, y);

  autoTable(doc, {
    startY: y + 4,
    head: [['Field', 'Details']],
    body: [
      ['Client Number', client.client_number],
      ['Full Name', client.full_name],
      ['NIN', client.nin],
      ['Gender / DOB', `${client.gender} | ${client.date_of_birth}`],
      ['Occupation / Employer', `${client.occupation} (${client.employer || 'N/A'})`],
      ['Phone Number', client.phone_number],
      ['Alternative Contact', client.alt_phone_number || 'N/A'],
      ['Email Address', client.email || 'N/A'],
      ['Physical Address', client.physical_address],
      ['Location (Village/Parish)', `${client.village}, ${client.parish}`],
      ['Sub County / District', `${client.sub_county}, ${client.district}`],
      ['Date Registered', client.date_registered],
      ['Client Status', client.status]
    ],
    theme: 'grid',
    headStyles: { fillColor: [11, 67, 148], textColor: 255 },
    styles: { fontSize: 9.5 }
  });

  drawPDFFooter(doc, 'Registration Desk');
  doc.save(`Client_Profile_${client.client_number}.pdf`);
}

// 2. Loan Application Form PDF
export function generateLoanApplicationPDF(app: LoanApplication) {
  const doc = new jsPDF();
  drawPDFHeader(doc, 'Loan Application', app.application_number);

  let y = 48;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 41, 98);
  doc.text('APPLICATION DETAILS', 14, y);

  autoTable(doc, {
    startY: y + 4,
    head: [['Field', 'Details']],
    body: [
      ['Application Number', app.application_number],
      ['Client Name', app.client?.full_name || 'N/A'],
      ['Client Number', app.client?.client_number || 'N/A'],
      ['Loan Product', app.product?.product_name || 'Business Loan'],
      ['Requested Amount', formatUGX(app.requested_amount)],
      ['Loan Duration', `${app.requested_weeks} Weeks`],
      ['Loan Purpose', app.loan_purpose],
      ['Guarantor Name', app.guarantor_name],
      ['Guarantor Phone', app.guarantor_phone],
      ['Guarantor NIN', app.guarantor_nin],
      ['Guarantor Relationship', app.guarantor_relationship],
      ['Guarantor Address', app.guarantor_address],
      ['Application Status', app.status]
    ],
    theme: 'grid',
    headStyles: { fillColor: [11, 67, 148], textColor: 255 },
    styles: { fontSize: 9.5 }
  });

  drawPDFFooter(doc, 'Loan Officer', 'Credit Officer');
  doc.save(`Loan_Application_${app.application_number}.pdf`);
}

// 3. Loan Agreement & Schedule PDF
export function generateLoanAgreementPDF(loan: Loan) {
  const doc = new jsPDF();
  drawPDFHeader(doc, 'Loan Agreement & Schedule', loan.loan_number);

  let y = 48;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 41, 98);
  doc.text('LOAN SUMMARY & TERMS', 14, y);

  autoTable(doc, {
    startY: y + 4,
    head: [['Parameter', 'Specification', 'Parameter', 'Specification']],
    body: [
      ['Loan Number', loan.loan_number, 'Client Name', loan.client?.full_name || 'N/A'],
      ['Principal Amount', formatUGX(loan.principal_amount), 'Interest Rate', `${loan.interest_rate}% (${loan.interest_type})`],
      ['Total Interest', formatUGX(loan.total_interest_amount), 'Total Payable', formatUGX(loan.total_amount_payable)],
      ['Weekly Installment', formatUGX(loan.weekly_installment), 'Duration', `${loan.loan_period_weeks} Weeks`],
      ['First Repayment Date', loan.first_repayment_date, 'Final Due Date', loan.final_due_date]
    ],
    theme: 'grid',
    headStyles: { fillColor: [11, 67, 148], textColor: 255 },
    styles: { fontSize: 8.5 }
  });

  const nextY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('WEEKLY REPAYMENT SCHEDULE', 14, nextY);

  if (loan.schedule && loan.schedule.length > 0) {
    autoTable(doc, {
      startY: nextY + 4,
      head: [['Wk #', 'Due Date', 'Installment', 'Principal', 'Interest', 'Remaining Bal', 'Status']],
      body: loan.schedule.map((row) => [
        row.week_number,
        row.due_date,
        formatUGX(row.installment_amount),
        formatUGX(row.principal_portion),
        formatUGX(row.interest_portion),
        formatUGX(row.remaining_balance),
        row.status
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 41, 98], textColor: 255 },
      styles: { fontSize: 8 }
    });
  }

  drawPDFFooter(doc, 'Loan Officer', 'Branch Manager');
  doc.save(`Loan_Agreement_${loan.loan_number}.pdf`);
}

// 4. Loan Disbursement Voucher PDF
export function generateDisbursementVoucherPDF(loan: Loan) {
  const doc = new jsPDF();
  drawPDFHeader(doc, 'Disbursement Voucher', loan.loan_number);

  let y = 48;
  autoTable(doc, {
    startY: y,
    head: [['Voucher Item', 'Amount & Details']],
    body: [
      ['Loan Number', loan.loan_number],
      ['Client Name', loan.client?.full_name || 'N/A'],
      ['NIN', loan.client?.nin || 'N/A'],
      ['Approved Principal', formatUGX(loan.principal_amount)],
      ['Processing Fee (Deducted)', formatUGX(loan.processing_fee_amount)],
      ['Net Cash Disbursed', formatUGX(loan.principal_amount - loan.processing_fee_amount)],
      ['Disbursement Date', loan.disbursed_at ? loan.disbursed_at.split('T')[0] : new Date().toISOString().split('T')[0]],
      ['Disbursed By', 'Branch Manager / Administrator']
    ],
    theme: 'grid',
    headStyles: { fillColor: [220, 38, 38], textColor: 255 }
  });

  drawPDFFooter(doc, 'Cashier', 'Finance Manager');
  doc.save(`Disbursement_Voucher_${loan.loan_number}.pdf`);
}

// 5. Weekly Repayment Receipt PDF
export function generateRepaymentReceiptPDF(repayment: LoanRepayment) {
  const doc = new jsPDF('portrait', 'mm', [148, 210]); // A5 size receipt
  drawPDFHeader(doc, 'Repayment Receipt', repayment.receipt_number);

  autoTable(doc, {
    startY: 45,
    head: [['Payment Record', 'Details']],
    body: [
      ['Receipt Number', repayment.receipt_number],
      ['Payment Date', repayment.payment_date],
      ['Client Name', repayment.client?.full_name || 'N/A'],
      ['Loan Number', repayment.loan?.loan_number || 'N/A'],
      ['Amount Paid', formatUGX(repayment.amount_paid)],
      ['Payment Method', repayment.payment_method],
      ['New Outstanding Balance', formatUGX(repayment.loan?.outstanding_balance || 0)],
      ['Recorded By', 'Loan Officer']
    ],
    theme: 'grid',
    headStyles: { fillColor: [11, 67, 148], textColor: 255 }
  });

  drawPDFFooter(doc, 'Receiving Officer');
  doc.save(`Repayment_Receipt_${repayment.receipt_number}.pdf`);
}

// 6. Savings Account Statement PDF
export function generateSavingsStatementPDF(accNumber: string, holderName: string, balance: number, transactions: SavingsTransaction[]) {
  const doc = new jsPDF();
  drawPDFHeader(doc, 'Savings Passbook Statement', accNumber);

  let y = 48;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Account Holder: ${holderName} | Account #: ${accNumber}`, 14, y);
  doc.text(`Current Savings Balance: ${formatUGX(balance)}`, 14, y + 5);

  autoTable(doc, {
    startY: y + 10,
    head: [['Tx #', 'Receipt #', 'Type', 'Amount', 'Balance After', 'Method', 'Date']],
    body: transactions.map(t => [
      t.transaction_number,
      t.receipt_number,
      t.transaction_type,
      formatUGX(t.amount),
      formatUGX(t.balance_after),
      t.payment_method,
      new Date(t.created_at).toLocaleDateString()
    ]),
    theme: 'grid',
    headStyles: { fillColor: [11, 67, 148], textColor: 255 },
    styles: { fontSize: 8.5 }
  });

  drawPDFFooter(doc, 'Vault Officer');
  doc.save(`Savings_Statement_${accNumber}.pdf`);
}

// 7. Client Loan Statement / Outstanding Statement
export function generateLoanStatementPDF(loan: Loan, repayments: LoanRepayment[]) {
  const doc = new jsPDF();
  drawPDFHeader(doc, 'Client Loan Statement', loan.loan_number);

  let y = 48;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Client: ${loan.client?.full_name} | Loan #: ${loan.loan_number}`, 14, y);
  doc.text(`Principal: ${formatUGX(loan.principal_amount)} | Outstanding: ${formatUGX(loan.outstanding_balance)}`, 14, y + 5);

  autoTable(doc, {
    startY: y + 10,
    head: [['Receipt #', 'Date', 'Amount Paid', 'Method', 'Recorded By']],
    body: repayments.map(r => [
      r.receipt_number,
      r.payment_date,
      formatUGX(r.amount_paid),
      r.payment_method,
      'Loan Officer'
    ]),
    theme: 'grid',
    headStyles: { fillColor: [11, 67, 148], textColor: 255 }
  });

  drawPDFFooter(doc, 'Accountant');
  doc.save(`Loan_Statement_${loan.loan_number}.pdf`);
}

// 8. Expense Voucher PDF
export async function generateExpenseVoucherPDF(expense: Expense) {
  const doc = new jsPDF();
  await drawVoucherHeader(doc, 'Expense Voucher', expense.expense_number);

  autoTable(doc, {
    startY: 40,
    head: [['Voucher Field', 'Detail']],
    body: [
      ['Expense Number', expense.expense_number],
      ['Expense Category', expense.category],
      ['Description', expense.description],
      ['Payment Method', expense.payment_method],
      ['Expense Date', expense.expense_date]
    ],
    theme: 'grid',
    headStyles: { fillColor: V_NAVY, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 3, textColor: [51, 65, 85] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } }
  });

  const afterTable = lastTableEnd(doc) + 8;
  drawAmountBox(doc, 'Amount Paid', expense.amount, afterTable, 'red');

  drawVoucherFooter(doc, ['Prepared By: Accountant', 'Received By', 'Approved By: Administrator']);
  doc.save(`Expense_Voucher_${expense.expense_number}.pdf`);
}

// 9. Bank Transaction Voucher PDF
export async function generateBankTransactionPDF(tx: BankTransaction) {
  const doc = new jsPDF();
  const isDeposit = tx.transaction_type === 'Deposit';
  await drawVoucherHeader(doc, `${tx.transaction_type} Voucher`, tx.transaction_number);

  autoTable(doc, {
    startY: 40,
    head: [['Transaction Field', 'Detail']],
    body: [
      ['Transaction Number', tx.transaction_number],
      ['Type', tx.transaction_type],
      ['Category', tx.category],
      ['Description', tx.description],
      ['Reference Number', tx.reference_number],
      ['Transaction Date', tx.transaction_date],
      ['Closing Bank Balance', formatUGX(tx.balance_after)]
    ],
    theme: 'grid',
    headStyles: { fillColor: isDeposit ? V_NAVY : V_RED, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 3, textColor: [51, 65, 85] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } }
  });

  const afterTable = lastTableEnd(doc) + 8;
  drawAmountBox(doc, `${tx.transaction_type} Amount`, tx.amount, afterTable, isDeposit ? 'green' : 'red');

  drawVoucherFooter(doc, ['Prepared By: Finance Officer', 'Verified By: Cashier', 'Approved By: Administrator']);
  doc.save(`Bank_${tx.transaction_type}_Voucher_${tx.transaction_number}.pdf`);
}

// 10. Financial Portfolio / Cash Flow Report PDF
export function generatePortfolioReportPDF(title: string, dataRows: string[][], headers: string[]) {
  const doc = new jsPDF();
  drawPDFHeader(doc, title);

  autoTable(doc, {
    startY: 48,
    head: [headers],
    body: dataRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 41, 98], textColor: 255 },
    styles: { fontSize: 8.5 }
  });

  drawPDFFooter(doc, 'System Generated', 'Chief Financial Officer');
  doc.save(`${title.replace(/\s+/g, '_')}_Report.pdf`);
}
