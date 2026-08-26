/**
 * Loads a realistic demonstration data set covering every module.
 *
 * Everything it creates is tagged in `demo-manifest.json` next to this file, so
 * `node scripts/clear-demo.mjs` can remove exactly what was added and nothing
 * else. Run against a live institution only if you actually want demo records
 * in it.
 *
 *   node scripts/seed-demo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'Chetu@2026';
const made = { users: [], branches: [], products: [], groups: [], clients: [], apps: [], loans: [], transfers: [], notifications: [] };

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().split('T')[0];
const stamp = (offset) => new Date(Date.now() + offset * 86400000).toISOString();
const must = (label, { data, error }) => { if (error) throw new Error(`${label}: ${error.message}`); return data; };

// ---------------------------------------------------------------- branches --
const branchA = must('branch A', await svc.from('branches').insert({
  branch_name: 'Iganga Main', branch_code: 'IGA-01', location: 'Iganga Town, Main Street',
  phone: '0392000101', manager_name: 'Sarah Namubiru', status: 'Active',
}).select().single());
const branchB = must('branch B', await svc.from('branches').insert({
  branch_name: 'Jinja Central', branch_code: 'JJA-02', location: 'Jinja, Clive Road',
  phone: '0392000202', manager_name: 'Peter Wanyama', status: 'Active',
}).select().single());
made.branches.push(branchA.id, branchB.id);

// ---------------------------------------------------------------- products --
const productA = must('product A', await svc.from('loan_products').insert({
  product_name: 'Umoja Micro Loan', description: 'Working capital for market traders and small shops.',
  interest_rate: 15, interest_type: 'Flat Rate', processing_fee_percentage: 4,
  penalty_rate: 1, grace_period_weeks: 1, min_amount: 200000, max_amount: 3000000,
  min_weeks: 8, max_weeks: 40, status: 'Active',
}).select().single());
const productB = must('product B', await svc.from('loan_products').insert({
  product_name: 'Kilimo Agri Loan', description: 'Seasonal input finance for smallholder farmers.',
  interest_rate: 12, interest_type: 'Flat Rate', processing_fee_percentage: 4,
  penalty_rate: 1, grace_period_weeks: 2, min_amount: 300000, max_amount: 5000000,
  min_weeks: 12, max_weeks: 52, status: 'Active',
}).select().single());
made.products.push(productA.id, productB.id);

// ------------------------------------------------------------------- staff --
const makeStaff = async (fullName, phone, email, role, branchIds) => {
  const created = must(`auth ${fullName}`, await svc.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { full_name: fullName, role, phone_number: phone },
  }));
  made.users.push(created.user.id);
  must(`profile ${fullName}`, await svc.from('profiles').upsert({
    id: created.user.id, email, full_name: fullName, role, phone_number: phone,
    status: 'Active', branch_ids: branchIds,
  }).select().single());
  return created.user.id;
};

const manager  = await makeStaff('Sarah Namubiru',   '0771000001', 'sarah.namubiru@chetumf.co.ug',  'Branch Manager', [branchA.id]);
const officer1 = await makeStaff('Nakabugo Marjorie','0771000002', 'marjorie.nakabugo@chetumf.co.ug','Loan Officer',   [branchA.id]);
const officer2 = await makeStaff('Okello Brian',     '0771000003', 'brian.okello@chetumf.co.ug',     'Loan Officer',   [branchB.id]);
const auditor  = await makeStaff('Grace Atim',       '0771000004', 'grace.atim@chetumf.co.ug',       'Auditor',        []);

// ------------------------------------------------------------------ groups --
const makeGroup = async (name, code, branch, officerId, officerName, approval, extra = {}) =>
  must(`group ${name}`, await svc.from('client_groups').insert({
    group_name: name, group_code: code, branch_id: branch.id, branch: branch.branch_name,
    loan_officer_id: officerId, loan_officer_name: officerName,
    village: 'Nakalama', meeting_day: 'Tuesday', meeting_time: '10:00 AM',
    meeting_location: 'Nakalama Trading Centre', meeting_frequency: 'Weekly',
    formation_date: day(-240), approval_status: approval, status: 'Active',
    created_by: officerId, ...extra,
  }).select().single());

const gDembe   = await makeGroup('Dembe Womens Group', 'CM-GRP-2026-0001', branchA, officer1, 'Nakabugo Marjorie', 'Approved',
  { reviewed_by: manager, reviewed_at: stamp(-235) });
const gTwezike = await makeGroup('Twezike Traders',    'CM-GRP-2026-0002', branchA, officer1, 'Nakabugo Marjorie', 'Approved',
  { reviewed_by: manager, reviewed_at: stamp(-180) });
const gKilimo  = await makeGroup('Kilimo Farmers',     'CM-GRP-2026-0003', branchB, officer2, 'Okello Brian',      'Approved',
  { reviewed_by: manager, reviewed_at: stamp(-150) });
const gPending = await makeGroup('Bugiri Youth Group', 'CM-GRP-2026-0004', branchA, officer1, 'Nakabugo Marjorie', 'Pending');
const gRejected = await makeGroup('Nsinze Savers',     'CM-GRP-2026-0005', branchA, officer1, 'Nakabugo Marjorie', 'Rejected',
  { rejection_reason: 'Only 3 members listed — the minimum is 5.', reviewed_by: manager, reviewed_at: stamp(-20) });
made.groups.push(gDembe.id, gTwezike.id, gKilimo.id, gPending.id, gRejected.id);

// ----------------------------------------------------------------- members --
let nin = 1000;
const makeMember = async (name, gender, phone, group, branch, officerId, approval, extra = {}) => {
  nin += 1;
  return must(`member ${name}`, await svc.from('clients').insert({
    client_number: '', full_name: name, nin: `CM${nin}75103ZAJD`, voter_id: `VT${nin}`,
    gender, marital_status: 'Married', date_of_birth: '1988-06-14',
    occupation: 'Trader', phone_number: phone, physical_address: 'Nakalama',
    village: 'Nakalama', parish: 'Nakalama', sub_county: 'Iganga', district: branch.branch_name.split(' ')[0],
    member_type: 'Member', group_id: group?.id ?? null, branch_id: branch.id,
    loan_officer_id: officerId, registered_by: officerId, date_registered: day(-200),
    approval_status: approval, status: 'Active', ...extra,
  }).select().single());
};

const m = {};
m.mary     = await makeMember('Nangobi Mary',            'Female', '0772650416', gDembe,   branchA, officer1, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-198) });
m.pheibe   = await makeMember('Mpayaliku Pheibe',        'Female', '0742372465', gDembe,   branchA, officer1, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-198) });
m.zeresi   = await makeMember('Bagozanya Zeresi',        'Female', '0707510335', gDembe,   branchA, officer1, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-190) });
m.jamira   = await makeMember('Nalunga Jamira',          'Female', '0750875995', gTwezike, branchA, officer1, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-170) });
m.rebecca  = await makeMember('Namajja Rebecca',         'Female', '0702892788', gTwezike, branchA, officer1, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-170) });
m.hadija   = await makeMember('Mirembe Hadija',          'Female', '0754799864', gTwezike, branchA, officer1, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-160) });
m.moses    = await makeMember('Waiswa Moses',            'Male',   '0781223344', gKilimo,  branchB, officer2, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-140) });
m.esther   = await makeMember('Akello Esther',           'Female', '0781223355', gKilimo,  branchB, officer2, 'Approved', { reviewed_by: manager, reviewed_at: stamp(-140) });
m.waiting  = await makeMember('Nabirye Justine',         'Female', '0788990011', gDembe,   branchA, officer1, 'Pending');
m.waiting2 = await makeMember('Kirunda Samuel',          'Male',   '0788990022', gTwezike, branchA, officer1, 'Pending');
m.rejected = await makeMember('Tenywa Ronald',           'Male',   '0788990033', gDembe,   branchA, officer1, 'Rejected',
  { rejection_reason: 'National ID photo unreadable — re-capture and resubmit.', reviewed_by: manager, reviewed_at: stamp(-15) });
m.inactive = await makeMember('Kagoya Betty',            'Female', '0788990044', gDembe,   branchA, officer1, 'Approved',
  { status: 'Inactive', inactive_reason: 'Relocated out of the branch catchment', inactive_date: day(-45) });
m.deceased = await makeMember('Mukisa Joseph',           'Male',   '0788990055', gTwezike, branchA, officer1, 'Approved',
  { status: 'Inactive', death_date: day(-30) });
made.clients.push(...Object.values(m).map((c) => c.id));

// Admission + passbook fees for every approved member.
const feeRows = Object.values(m)
  .filter((c) => c.approval_status === 'Approved')
  .map((c) => ({
    client_id: c.id, admission_fee: 5000, passbook_fee: 5000, crb_fee: 0, total_amount: 10000,
    payment_method: 'Cash', receipt_number: `CM-ADM-${c.client_number}`,
    branch_id: c.branch_id, collected_by: c.loan_officer_id,
  }));
must('member fees', await svc.from('member_fees').insert(feeRows).select());

// ------------------------------------------------------------------- loans --
const FEES = { proc: 0.04, crb: 0.01, sec: 0.15, gm: 2000 };
const buildSchedule = (loanId, weeks, weekly, firstDue, paidWeeks) => {
  const rows = [];
  let d = new Date(firstDue);
  let balance = weekly * weeks;
  for (let w = 1; w <= weeks; w += 1) {
    const paid = w <= paidWeeks ? weekly : 0;
    balance -= paid;
    rows.push({
      loan_id: loanId, week_number: w, due_date: d.toISOString().split('T')[0],
      installment_amount: weekly, principal_portion: Math.round(weekly * 0.87),
      interest_portion: weekly - Math.round(weekly * 0.87),
      paid_amount: paid, remaining_balance: weekly - paid,
      status: paid >= weekly ? 'Paid' : 'Pending',
      paid_at: paid > 0 ? d.toISOString() : null,
    });
    d = new Date(d.getTime() + 7 * 86400000);
  }
  return rows;
};

const makeLoan = async (client, product, principal, weeks, opts) => {
  const interest = Math.round(principal * (product.interest_rate / 100));
  const total = principal + interest;
  const weekly = Math.round(total / weeks);
  const proc = Math.round(principal * FEES.proc);
  const crb = Math.round(principal * FEES.crb);
  const sec = Math.round(principal * FEES.sec);
  const deductions = proc + crb + sec + FEES.gm;

  const app = must(`application ${client.full_name}`, await svc.from('loan_applications').insert({
    application_number: '', client_id: client.id, product_id: product.id,
    requested_amount: principal, requested_weeks: weeks,
    loan_purpose: opts.purpose ?? 'Business - Stock Purchase',
    guarantor_name: 'Nalunga Jamira', guarantor_phone: '0750875995',
    guarantor_relationship: 'Group Member', guarantor_nin: 'CF83075103ZAJD',
    guarantor_address: 'Nakalama', status: opts.appStatus,
    submitted_by: client.loan_officer_id, reviewed_by: opts.appStatus === 'Pending' ? null : manager,
    rejection_reason: opts.rejectionReason ?? null,
    created_at: stamp(opts.appDays ?? -60),
  }).select().single());
  made.apps.push(app.id);
  if (!opts.loanStatus) return { app };

  const paidWeeks = opts.paidWeeks ?? 0;
  const outstanding = opts.outstandingOverride ?? Math.max(0, total - paidWeeks * weekly);
  const loan = must(`loan ${client.full_name}`, await svc.from('loans').insert({
    loan_number: '', application_id: app.id, client_id: client.id, product_id: product.id,
    principal_amount: principal, interest_rate: product.interest_rate, interest_type: product.interest_type,
    loan_period_weeks: weeks, total_interest_amount: interest, total_amount_payable: total,
    weekly_installment: weekly, processing_fee_amount: proc, crb_fee_amount: crb,
    security_amount: sec, security_balance: opts.securityBalance ?? sec,
    group_maintenance_fee: FEES.gm, net_disbursed_amount: principal - deductions,
    first_repayment_date: opts.firstDue, final_due_date: day(opts.finalDueOffset ?? 120),
    outstanding_balance: outstanding,
    completion_percentage: Math.round(((total - outstanding) / total) * 100),
    status: opts.loanStatus, approved_by: manager,
    disbursed_by: opts.loanStatus === 'Pending' ? null : client.loan_officer_id,
    disbursed_at: opts.loanStatus === 'Pending' ? null : stamp(opts.disbursedDays ?? -55),
    ...(opts.extra ?? {}),
  }).select().single());
  made.loans.push(loan.id);

  if (opts.loanStatus !== 'Pending') {
    must('schedule', await svc.from('loan_repayment_schedule').insert(buildSchedule(loan.id, weeks, weekly, opts.firstDue, paidWeeks)).select());
    for (let w = 1; w <= paidWeeks; w += 1) {
      must('repayment', await svc.from('loan_repayments').insert({
        repayment_number: '', receipt_number: '', loan_id: loan.id, client_id: client.id,
        amount_paid: weekly, payment_date: day((opts.disbursedDays ?? -55) + w * 7),
        payment_method: 'Cash', collection_type: 'Regular', recorded_by: client.loan_officer_id,
      }).select().single());
    }
  }
  return { app, loan };
};

// A spread of states, so every screen has something to show.
await makeLoan(m.mary,    productA, 1000000, 20, { loanStatus: 'Partially Paid', appStatus: 'Disbursed', firstDue: day(-48), paidWeeks: 6 });
await makeLoan(m.pheibe,  productA,  800000, 20, { loanStatus: 'Overdue',        appStatus: 'Disbursed', firstDue: day(-75), paidWeeks: 2, disbursedDays: -82 });
await makeLoan(m.zeresi,  productA,  600000, 16, { loanStatus: 'Active',         appStatus: 'Disbursed', firstDue: day(-14), paidWeeks: 2 });
await makeLoan(m.jamira,  productA, 1500000, 24, { loanStatus: 'Partially Paid', appStatus: 'Disbursed', firstDue: day(-35), paidWeeks: 5 });
await makeLoan(m.moses,   productB, 2000000, 30, { loanStatus: 'Active',         appStatus: 'Disbursed', firstDue: day(-21), paidWeeks: 3, purpose: 'Agriculture - Crop Farming' });
await makeLoan(m.esther,  productB, 1200000, 24, { loanStatus: 'Defaulted',      appStatus: 'Disbursed', firstDue: day(-140), paidWeeks: 1, disbursedDays: -147,
  extra: { is_bad_debt: true, bad_debt_declared_at: stamp(-10), bad_debt_comment: 'Member untraceable since March.', writeoff_status: 'Declared' } });
await makeLoan(m.rebecca, productA,  500000, 12, { loanStatus: 'Fully Paid',     appStatus: 'Disbursed', firstDue: day(-120), paidWeeks: 12, disbursedDays: -127, outstandingOverride: 0 });
// Approved, cash not yet released — populates Waiting for Disburse.
await makeLoan(m.hadija,  productA,  700000, 16, { loanStatus: 'Pending',        appStatus: 'Approved',  firstDue: day(7), appDays: -3 });
// Still waiting on the manager.
await makeLoan(m.waiting, productA,  400000, 12, { appStatus: 'Pending', appDays: -2 });
// Turned down.
await makeLoan(m.zeresi,  productA,  900000, 20, { appStatus: 'Rejected', appDays: -8,
  rejectionReason: 'Existing loan still outstanding — clear it before applying again.' });

// ----------------------------------------------------------------- savings --
// A savings account is opened by the application when a member is admitted;
// seeding writes rows directly, so they are created here explicitly.
const savings = must('savings accounts', await svc.from('savings_accounts').insert(
  [m.mary, m.jamira, m.moses].map((c) => ({
    account_number: '', client_id: c.id, account_type: 'Individual', balance: 0, status: 'Active',
  })),
).select());
for (const acc of savings ?? []) {
  let balance = 0;
  for (const [amount, offset] of [[50000, -60], [30000, -30], [25000, -7]]) {
    balance += amount;
    must('savings tx', await svc.from('savings_transactions').insert({
      transaction_number: '', receipt_number: '', account_id: acc.id, transaction_type: 'Deposit',
      amount, balance_after: balance, payment_method: 'Cash', payment_date: day(offset),
    }).select().single());
  }
  await svc.from('savings_accounts').update({ balance }).eq('id', acc.id);
}

// ------------------------------------------------------------------ ledger --
must('bank', await svc.from('bank_transactions').insert([
  { transaction_number: '', transaction_type: 'Deposit', category: 'Capital Injection', description: 'Shareholder capital', amount: 25000000, balance_after: 25000000, reference_number: 'STB-CAP-001', transaction_date: day(-200), branch_id: branchA.id },
  { transaction_number: '', transaction_type: 'Deposit', category: 'Branch Float', description: 'Float to Jinja Central', amount: 8000000, balance_after: 33000000, reference_number: 'STB-FLT-002', transaction_date: day(-150), branch_id: branchB.id },
]).select());

must('expenses', await svc.from('expenses').insert([
  { expense_number: '', category: 'Rent', description: 'Iganga branch rent — quarter', amount: 1800000, expense_date: day(-40), payment_method: 'Bank Transfer', branch_id: branchA.id },
  { expense_number: '', category: 'Fuel', description: 'Field collection fuel', amount: 320000, expense_date: day(-12), payment_method: 'Cash', branch_id: branchA.id },
  { expense_number: '', category: 'Salaries', description: 'Field staff salaries', amount: 4200000, expense_date: day(-5), payment_method: 'Bank Transfer', branch_id: branchA.id },
]).select());

// --------------------------------------------------------------- transfers --
const transfer = must('transfer', await svc.from('transfers').insert({
  transfer_type: 'Member Branch', client_id: m.zeresi.id,
  from_branch_id: branchA.id, to_branch_id: branchB.id, from_group_id: gDembe.id,
  status: 'Pending', reason: 'Member has relocated to Jinja.', requested_by: officer1,
}).select().single());
made.transfers.push(transfer.id);

// ----------------------------------------------------------- notifications --
const admin = must('admin', await svc.from('profiles').select('id').eq('role', 'Administrator').limit(1).single());
const notes = [
  ['Group waiting for approval', 'Bugiri Youth Group (CM-GRP-2026-0004) was created by Nakabugo Marjorie and needs your approval.', 'Application', '/groups/waiting-approval', 0.02, false],
  ['Member waiting for approval', 'Nabirye Justine was admitted by Nakabugo Marjorie and needs your approval.', 'Application', '/member-waiting-approval', 0.1, false],
  ['New loan application', 'Nabirye Justine applied for UGX 400,000.', 'Application', '/loan-waiting-approval', 0.5, false],
  ['Loan application approved', 'Mirembe Hadija was approved. The loan is ready for disbursement.', 'Disbursement', '/loan-waiting-disburse', 3, false],
  ['Repayment received', 'UGX 57,500 received on loan from Nangobi Mary.', 'Repayment', '/repayments', 8, true],
  ['Member transfer awaiting receipt', 'Bagozanya Zeresi has been sent to Jinja Central and is waiting to be received.', 'Alert', '/transfers/receive', 26, true],
];
const noteRows = notes.map(([title, message, type, link_url, hoursAgo, is_read], i) => ({
  id: `DEMO-N-${i}`, recipient_id: admin.id, title, message, type, link_url, is_read,
  created_at: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
}));
must('notifications', await svc.from('notifications').insert(noteRows).select());
made.notifications.push(...noteRows.map((n) => n.id));

writeFileSync(resolve(HERE, 'demo-manifest.json'), JSON.stringify(made, null, 2));

console.log(`
Demo data loaded.

  Branches      2   Iganga Main, Jinja Central
  Loan products 2   Umoja Micro Loan, Kilimo Agri Loan
  Staff         4   plus your Administrator
  Groups        5   3 approved, 1 pending, 1 rejected
  Members      13   8 approved, 2 pending, 1 rejected, 1 inactive, 1 deceased
  Loans         7   active, partially paid, overdue, defaulted, fully paid, awaiting disbursement
  Applications 10   including 1 pending and 1 rejected
  Also          savings, bank ledger, expenses, a pending branch transfer and notifications

Sign in with any of these — password ${PASSWORD}

  Branch Manager  sarah.namubiru@chetumf.co.ug     0771000001
  Loan Officer    marjorie.nakabugo@chetumf.co.ug  0771000002
  Loan Officer    brian.okello@chetumf.co.ug       0771000003
  Auditor         grace.atim@chetumf.co.ug         0771000004

Remove it all again with:  node scripts/clear-demo.mjs
`);
