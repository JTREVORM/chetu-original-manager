import jsPDF from 'jspdf';
import { autoTable } from './autoTable';
import { formatUGX } from './loanCalculations';
import { Client, Loan, LoanApplication, LoanRepayment, Expense, BankTransaction, SavingsTransaction } from '../types/database.types';

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
export function generateExpenseVoucherPDF(expense: Expense) {
  const doc = new jsPDF();
  drawPDFHeader(doc, 'Expense Voucher', expense.expense_number);

  autoTable(doc, {
    startY: 48,
    head: [['Voucher Field', 'Detail']],
    body: [
      ['Expense Number', expense.expense_number],
      ['Expense Category', expense.category],
      ['Description', expense.description],
      ['Amount Paid', formatUGX(expense.amount)],
      ['Date', expense.expense_date],
      ['Payment Method', expense.payment_method],
      ['Recorded By', 'Administrator']
    ],
    theme: 'grid',
    headStyles: { fillColor: [220, 38, 38], textColor: 255 }
  });

  drawPDFFooter(doc, 'Accountant', 'Administrator');
  doc.save(`Expense_Voucher_${expense.expense_number}.pdf`);
}

// 9. Bank Transaction Voucher PDF
export function generateBankTransactionPDF(tx: BankTransaction) {
  const doc = new jsPDF();
  drawPDFHeader(doc, `${tx.transaction_type} Voucher`, tx.transaction_number);

  autoTable(doc, {
    startY: 48,
    head: [['Transaction Field', 'Detail']],
    body: [
      ['Transaction Number', tx.transaction_number],
      ['Type', tx.transaction_type],
      ['Category', tx.category],
      ['Description', tx.description],
      ['Amount', formatUGX(tx.amount)],
      ['Reference Number', tx.reference_number],
      ['Closing Bank Balance', formatUGX(tx.balance_after)],
      ['Date', tx.transaction_date]
    ],
    theme: 'grid',
    headStyles: { fillColor: tx.transaction_type === 'Deposit' ? [11, 67, 148] : [220, 38, 38], textColor: 255 }
  });

  drawPDFFooter(doc, 'Finance Officer', 'Administrator');
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
