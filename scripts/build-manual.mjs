/**
 * Assembles the user manual as a PDF from the captured screenshots.
 *
 *   node scripts/capture-manual-shots.mjs
 *   node scripts/build-manual.mjs
 *
 * Writes docs/Chetu-Microfinance-User-Manual.pdf (and the HTML it was
 * rendered from, so the wording can be corrected without re-shooting).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(HERE, "..", "docs");
const SHOTS = resolve(DOCS, "manual", "shots");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** Screenshots are inlined so the HTML and the PDF are both self-contained. */
const img = (stem) => {
  const file = resolve(SHOTS, `${stem}.png`);
  if (!existsSync(file)) return null;
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
};

const missing = [];
const figure = (stem, caption, kind = "desktop") => {
  const src = img(stem);
  if (!src) {
    missing.push(stem);
    return "";
  }
  return `<figure class="shot ${kind}">
      <img src="${src}" alt="${caption}">
      <figcaption>${caption}</figcaption>
    </figure>`;
};

/** A desktop and a phone view of the same screen, side by side. */
const pair = (stem, caption) => {
  const d = img(`${stem}-desktop`);
  const m = img(`${stem}-mobile`);
  if (!d && !m) {
    missing.push(stem);
    return "";
  }
  return `<div class="pair">
      ${d ? `<figure class="shot desktop"><img src="${d}" alt="${caption} on desktop"><figcaption>On a computer</figcaption></figure>` : ""}
      ${m ? `<figure class="shot phone"><img src="${m}" alt="${caption} on a phone"><figcaption>On a phone</figcaption></figure>` : ""}
    </div>
    <p class="cap">${caption}</p>`;
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Chetu Microfinance — User Manual</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1e293b; font-size: 10.5pt; line-height: 1.55; margin: 0; }
  h1, h2, h3 { color: #0B4394; margin: 0 0 .35em; line-height: 1.25; }
  h1 { font-size: 21pt; }
  h2 { font-size: 15pt; margin-top: 0; padding-bottom: .25em; border-bottom: 2px solid #0B4394; }
  h3 { font-size: 11.5pt; color: #0f172a; margin-top: 1.3em; }
  p { margin: 0 0 .7em; }
  ul, ol { margin: 0 0 .8em; padding-left: 1.15em; }
  li { margin-bottom: .3em; }
  code { background: #f1f5f9; padding: .1em .35em; border-radius: 3px; font-size: .92em; }
  .section { page-break-before: always; }
  .cover { display: flex; flex-direction: column; justify-content: center; height: 245mm; text-align: center; }
  .cover .mark { font-size: 30pt; font-weight: 800; color: #0B4394; letter-spacing: -.5px; }
  .cover .rule { width: 70px; height: 4px; background: #F5A623; margin: 14px auto 20px; }
  .cover .sub { font-size: 13pt; color: #475569; }
  .cover .meta { margin-top: 40px; font-size: 10pt; color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin: .5em 0 1em; font-size: 9.5pt; }
  th { background: #0B4394; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; }
  td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .shot { margin: 0; text-align: center; page-break-inside: avoid; }
  .shot img { border: 1px solid #cbd5e1; border-radius: 4px; max-width: 100%; }
  .shot.phone img { max-height: 118mm; width: auto; }
  .shot.desktop img { width: 100%; }
  .shot figcaption { font-size: 8.5pt; color: #64748b; margin-top: 4px; }
  .pair { display: flex; gap: 10px; align-items: flex-start; page-break-inside: avoid; }
  .pair .desktop { flex: 1 1 66%; }
  .pair .phone { flex: 0 0 30%; }
  .cap { font-size: 9pt; color: #475569; font-style: italic; text-align: center; margin: 2px 0 1.2em; }
  .note { border-left: 3px solid #F5A623; background: #fffbeb; padding: 8px 12px; margin: .8em 0; font-size: 9.5pt; }
  .warn { border-left: 3px solid #D32F2F; background: #fef2f2; padding: 8px 12px; margin: .8em 0; font-size: 9.5pt; }
  .flow { background: #f1f5f9; border-radius: 4px; padding: 10px 14px; font-size: 9.5pt; margin: .8em 0; }
  .flow b { color: #0B4394; }
  .toc li { margin-bottom: .35em; }
</style></head><body>

<div class="cover">
  <div class="mark">CHETU MICROFINANCE LTD</div>
  <div class="rule"></div>
  <div class="sub">Management Information System<br>User Manual</div>
  <div class="meta">
    Version 1.0 &middot; ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}<br>
    Covers Groups, Members, Loans, Collections, Reports, Transfers and Administration
  </div>
</div>

<div class="section">
<h2>1. Before you start</h2>

<h3>What this system is for</h3>
<p>This system records the whole life of a group loan: forming a group, admitting members into it,
raising a loan application, approving and disbursing it, collecting weekly repayments, and closing
the loan — whether it is repaid, settled early, or written off. Everything you do is recorded against
your name.</p>

<h3>The three roles</h3>
<p>What you can see and do depends on your role. This is enforced by the system itself, not by
convention, so you cannot accidentally reach another branch's records.</p>
<table>
  <thead><tr><th style="width:22%">Role</th><th style="width:30%">Sees</th><th>Can do</th></tr></thead>
  <tbody>
    <tr><td><b>Loan Officer</b></td><td>Only their own members, groups and loans</td>
        <td>Create groups, admit members, raise loan applications, disburse approved loans, collect repayments</td></tr>
    <tr><td><b>Branch Manager</b></td><td>Everything in their branch</td>
        <td>Approve or reject groups, members and loan applications; collect; move members between groups; reassign groups</td></tr>
    <tr><td><b>Administrator</b></td><td>The whole institution</td>
        <td>Everything, plus staff accounts, branches, loan products, write-offs and reversals</td></tr>
    <tr><td><b>Auditor</b></td><td>The whole institution</td>
        <td>Nothing — read-only everywhere, by design</td></tr>
  </tbody>
</table>

<div class="note"><b>Why a manager cannot disburse.</b> The Branch Manager approves the loan and the
Loan Officer releases the cash. Two different people complete the transaction, so no one person can
both authorise and pay out. This is deliberate and is not a fault.</div>

<h3>Signing in</h3>
<p>Use <b>either your email address or your phone number</b>, together with your password. Your phone
number works because that is what field officers are used to; your email works because that is your
account.</p>
${pair("login", "The sign-in screen. The same details work on a computer and on a phone.")}

<div class="warn"><b>If you forget your password</b>, an Administrator resets it from
System&nbsp;Settings → User&nbsp;Management. Nobody, including an Administrator, can read your existing password.</div>
</div>

<div class="section">
<h2>2. Finding your way around</h2>
<p>The menu on the left groups the system by the work you are doing. On a phone it is hidden behind
the <b>☰</b> button in the top bar; tap a heading to open its screens.</p>
${figure("sidebar-mobile", "The menu on a phone, with the Members section opened.", "phone")}

<h3>The dashboard</h3>
<p>The dashboard is what you see when you sign in. It greets you, states what is waiting for your
attention, and then shows the portfolio <em>you</em> are responsible for.</p>
${pair("dashboard", "The Administrator dashboard: the whole institution, including the cash position.")}
${figure("dashboard-officer-desktop", "A Loan Officer sees only their own book — and no institutional cash figures, because they do not hold the ledger.")}

<h3>Notifications</h3>
<p>The bell in the top bar carries everything that has happened and everything waiting on you —
groups and members submitted for approval, loans approved, cash disbursed, repayments received,
transfers awaiting receipt. <b>Tap any notification to go straight to the screen where you act on it.</b></p>
${figure("notifications-mobile", "Notifications, newest first and grouped by day. Unread entries carry a blue bar.", "phone")}
</div>

<div class="section">
<h2>3. Groups</h2>
<p>A group is the unit the institution lends to. Members belong to a group, and the group meets weekly
to pay.</p>

<div class="flow"><b>Group Create</b> → <b>Waiting for Approval</b> → approved → <b>Group List</b><br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; rejected → <b>Group Rejected List</b> → corrected → back to approval</div>

<ol>
  <li>A <b>Loan Officer</b> opens <b>Groups → Group Create</b> and fills in the group name, branch,
      meeting day and location. The group code is issued automatically.</li>
  <li>The group appears under <b>Waiting for Approval Group</b>. It cannot take members or loans yet.</li>
  <li>A <b>Branch Manager</b> opens the same screen, reviews it, and approves or rejects it with a reason.</li>
  <li>Approved groups appear in <b>Group List</b>. Rejected ones go to <b>Group Rejected List</b>, where
      the officer can correct and resubmit them.</li>
</ol>
${pair("groups-approval", "Groups waiting for a manager\\u2019s decision. Tick, cross, or edit.")}

<div class="note">An officer cannot approve their own group. The system refuses it at the database
level, so it cannot be worked around from any screen.</div>
</div>

<div class="section">
<h2>4. Members</h2>
<p>A member is admitted into a group and pays a one-off admission and passbook charge.</p>

<div class="flow"><b>Member Admission</b> → <b>Waiting for Approval</b> → approved → <b>Member List</b><br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; rejected → <b>Member Rejected</b></div>

<h3>Admitting a member</h3>
<p>Open <b>Members → Member Admission</b>. Choose the branch, officer and group, then capture the
member's details. Only <b>approved</b> groups appear in the group list — a member cannot be put into a
group that has not been passed.</p>
${pair("member-admission", "The admission form. Fields are full width on a phone so they can be filled in the field.")}

<p>On saving, the system charges <b>UGX 5,000 admission</b> and <b>UGX 5,000 passbook</b> against the
member and opens their savings account.</p>

<h3>The member lists</h3>
<p>Members are separated by state so each list answers one question:</p>
<ul>
  <li><b>Member List</b> — active, approved members</li>
  <li><b>Waiting for Approval Member</b> — admitted, not yet passed</li>
  <li><b>Member Rejected</b> — turned down, with the reason; the officer corrects and resubmits</li>
  <li><b>Member Inactive List</b> — left or dormant</li>
  <li><b>Member Death List</b> — recorded deceased, kept separate so any open loan can be settled</li>
</ul>
${pair("member-list", "Member List. Each record shows branch, officer, group and contact details, with actions on the right.")}
</div>

<div class="section">
<h2>5. Loans</h2>

<h3>The charges</h3>
<p>Every loan carries the same charges. They are deducted at disbursement, so the member receives the
principal less the total.</p>
<table>
  <thead><tr><th>Charge</th><th style="width:22%">Rate</th><th style="width:38%">On a UGX 1,000,000 loan</th></tr></thead>
  <tbody>
    <tr><td>Processing fee</td><td>4% of principal</td><td>UGX 40,000</td></tr>
    <tr><td>CRB fee</td><td>1% of principal</td><td>UGX 10,000</td></tr>
    <tr><td>Security deposit <i>(refundable)</i></td><td>15% of principal</td><td>UGX 150,000</td></tr>
    <tr><td>Group maintenance</td><td>UGX 2,000 flat</td><td>UGX 2,000</td></tr>
    <tr><td><b>Total deductions</b></td><td></td><td><b>UGX 202,000</b></td></tr>
    <tr><td><b>Net cash to the member</b></td><td></td><td><b>UGX 798,000</b></td></tr>
  </tbody>
</table>
<div class="note">The charges are written onto the loan when it is approved. If the schedule ever
changes, existing loans keep what they were actually charged — history is never restated.</div>

<h3>Loan products</h3>
<p>A product sets the interest rate, the amount range and the repayment period. Every application
picks one. Only an Administrator can create or change products.</p>
${pair("loan-products", "Loan products, with the terms each one offers.")}

<h3>From application to cash</h3>
<div class="flow"><b>Loan Application</b> → <b>Waiting for Approval</b> → approved → <b>Waiting for Disburse</b> → disbursed → repayments begin<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; rejected → <b>Loan Rejected List</b> → corrected → resubmitted</div>

<ol>
  <li><b>Loan Application</b> — the officer searches for the member, picks the product, amount and
      period, sees the full repayment schedule and charges, picks a guarantor from the group, and the
      member consents.</li>
  <li><b>Waiting for Approval</b> — the manager reviews the figures and approves or rejects.</li>
  <li><b>Waiting for Disburse</b> — approving creates the loan and its weekly schedule. The officer
      releases the cash here.</li>
</ol>
${pair("loan-application", "Finding the member to lend to.")}
${pair("loan-approval", "The manager\\u2019s approval queue.")}
${pair("loan-disburse", "Approved loans waiting for cash, showing the net amount to hand over.")}
${pair("loan-rejected", "Rejected applications, with the reason. The officer corrects and resubmits.")}
</div>

<div class="section">
<h2>6. Collections</h2>
<p>Money coming back in. Choose the screen that matches what you are collecting:</p>
<ul>
  <li><b>Group Wise Collection</b> — the normal weekly round, a whole group at a time</li>
  <li><b>Overdue Collection</b> — chasing instalments already missed</li>
  <li><b>Advance Collection</b> — a member paying ahead</li>
  <li><b>BadDebts Collection</b> — recovering on a loan already declared bad</li>
  <li><b>Loan Settlement</b> — a member clearing the whole balance early</li>
</ul>
${pair("collections", "Group Wise Collection: pick branch, officer and group, then take the money.")}

<h3>When a loan goes bad</h3>
<p><b>Bad Loans List</b> ages every overdue loan and lets a manager declare it a bad debt with a
comment. Only an Administrator can then <b>write it off</b>, which closes the loan and removes the
balance from the portfolio.</p>
${pair("bad-loans", "Bad Loans List, aged by how long the loan has been in arrears.")}
</div>

<div class="section">
<h2>7. Reports</h2>
<p>Every report filters by branch, officer, group and date, and downloads as <b>PDF</b> or <b>Excel</b>
using the buttons at the top right.</p>
${pair("reports-index", "The reports index.")}

<table>
  <thead><tr><th style="width:34%">Report</th><th>Answers</th></tr></thead>
  <tbody>
    <tr><td>Disbursement / Master Roll</td><td>What did we lend out, and to whom?</td></tr>
    <tr><td>LO Wise Group Realizable</td><td>What should each officer collect from each group?</td></tr>
    <tr><td>Daily Overdue</td><td>Who is behind today?</td></tr>
    <tr><td>Outstanding Report</td><td>What is still owed on every loan?</td></tr>
    <tr><td>Day Collection List</td><td>What came in on a given day?</td></tr>
    <tr><td>Overdue Collection List</td><td>How much of the arrears did we recover?</td></tr>
    <tr><td>Portfolio at Risk</td><td>How much of the book is in arrears, and how badly?</td></tr>
    <tr><td>Loan Closure Report</td><td>Which loans ended, and how — repaid, settled or written off?</td></tr>
    <tr><td>Approval Pipeline</td><td>What is stuck waiting for a decision?</td></tr>
    <tr><td>Reversal Register</td><td>What has an Administrator rolled back?</td></tr>
    <tr><td>Fee Collection Report</td><td>What have we earned in fees?</td></tr>
  </tbody>
</table>
${pair("report-par", "Portfolio at Risk: ageing bands, and the PAR ratio over the open book.")}
${pair("report-fees", "Fee Collection: admission, passbook, processing, CRB and group maintenance, with the refundable security kept separate.")}
</div>

<div class="section">
<h2>8. Transfers</h2>
<ul>
  <li><b>Member Branch Transfer</b> — sends a member, with their loans, to another branch. Nothing
      moves until the receiving branch accepts.</li>
  <li><b>Receive Member</b> — the receiving manager accepts (choosing the group and officer) or rejects.</li>
  <li><b>Group Interchange</b> — moves a member to another group in the same branch. Immediate.</li>
  <li><b>Group LO Transfer</b> — hands a whole group and its members to another officer.</li>
</ul>
${pair("transfers-member", "Sending a member to another branch. Open loans and arrears are shown before you send.")}
<div class="note">A member with an open loan can still be transferred — the loan follows them, and the
receiving branch takes over collection.</div>
</div>

<div class="section">
<h2>9. Administration</h2>

<h3>Staff accounts</h3>
<p><b>System Settings → User Management.</b> Creating an account needs a full name, phone number,
<b>email address</b>, an initial password, and a role. Branch Managers and Loan Officers must be
attached to at least one branch — that attachment is what limits what they can see.</p>
${pair("users", "Staff accounts and the role each one holds.")}

<h3>Branches</h3>
<p><b>System Settings → Branch Network.</b> Create a branch before creating staff, groups or members —
everything else is attached to one.</p>
${pair("branches", "The branch network.")}

<h3>System settings</h3>
<p>Institution name, currency and the text printed on reports and receipts. The fee schedule is shown
here for reference but is fixed in the system, because charges are written onto each loan when it is
approved.</p>
${pair("settings", "System settings, with the standing fee schedule.")}

<div class="warn"><b>Danger zone.</b> "Reset all operational data" permanently deletes every member,
group, loan, repayment and audit log. You must type <code>DELETE ALL DATA</code> to confirm. There is
no undo and no backup is taken.</div>

<h3>The audit trail</h3>
<p><b>Audit Logs</b> records every action, who took it and when. The <b>Reversal Register</b> is the
counterpart for rollbacks: reversing a receipt deletes it, so the register is the only surviving
record that the money ever moved. It is the first thing an auditor should read.</p>
${figure("dashboard-auditor-desktop", "An Auditor sees the whole institution, read-only, with no action links.")}
</div>

<div class="section">
<h2>10. Quick reference</h2>

<h3>Who does what</h3>
<table>
  <thead><tr><th style="width:44%">Action</th><th>Who</th></tr></thead>
  <tbody>
    <tr><td>Create a group / admit a member</td><td>Loan Officer, Branch Manager, Administrator</td></tr>
    <tr><td>Approve or reject a group / member / loan</td><td>Branch Manager, Administrator</td></tr>
    <tr><td>Raise a loan application</td><td>Loan Officer, Administrator</td></tr>
    <tr><td>Disburse a loan</td><td>Loan Officer, Administrator</td></tr>
    <tr><td>Record a repayment or settlement</td><td>Loan Officer, Branch Manager, Administrator</td></tr>
    <tr><td>Declare a bad debt</td><td>Branch Manager, Administrator</td></tr>
    <tr><td>Write off a loan</td><td>Administrator only</td></tr>
    <tr><td>Reverse a disbursement or receipt</td><td>Administrator only</td></tr>
    <tr><td>Receive a transferred member</td><td>Branch Manager of the receiving branch, Administrator</td></tr>
    <tr><td>Manage staff, branches, products, settings</td><td>Administrator only</td></tr>
    <tr><td>Anything at all</td><td><i>Never an Auditor — read-only by design</i></td></tr>
  </tbody>
</table>

<h3>If something will not work</h3>
<table>
  <thead><tr><th style="width:46%">What you see</th><th>What it means</th></tr></thead>
  <tbody>
    <tr><td>The group you want is not in the list</td><td>It has not been approved yet, or it belongs to another branch.</td></tr>
    <tr><td>"Only a Branch Manager or Administrator can approve"</td><td>You are signed in as the officer who raised it. Approval is somebody else's job.</td></tr>
    <tr><td>"Only an Administrator can write off a loan"</td><td>Correct — ask an Administrator.</td></tr>
    <tr><td>A list is empty after pressing Search</td><td>The filters exclude everything. Clear the branch, officer and group and search again.</td></tr>
    <tr><td>You cannot create a Loan Officer</td><td>No branch exists yet. Create one in Branch Network first.</td></tr>
    <tr><td>Nothing at all appears anywhere</td><td>Your account may not be attached to a branch. An Administrator fixes this in User Management.</td></tr>
  </tbody>
</table>

<p style="margin-top:2em;font-size:9pt;color:#64748b;">
Chetu Microfinance Ltd — Management Information System. Every figure in this manual comes from
demonstration data and does not represent a real portfolio.</p>
</div>

</body></html>`;

const htmlPath = resolve(DOCS, "Chetu-Microfinance-User-Manual.html");
writeFileSync(htmlPath, html);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0", timeout: 180000 });
const pdfPath = resolve(DOCS, "Chetu-Microfinance-User-Manual.pdf");
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font-size:8pt;color:#94a3b8;padding:0 14mm;display:flex;justify-content:space-between;">' +
    '<span>Chetu Microfinance Ltd — User Manual</span><span class="pageNumber"></span></div>',
});
await browser.close();

if (missing.length)
  console.log("screenshots not found (sections rendered without them):", missing.join(", "));
console.log(`\nHTML → ${htmlPath}\nPDF  → ${pdfPath}`);
