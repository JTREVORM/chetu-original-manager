#!/usr/bin/env node
/**
 * READ-ONLY audit of every loan's repayment schedule.
 *
 *   node scripts/audit-schedules.mjs                  # report to stdout
 *   node scripts/audit-schedules.mjs --csv out.csv    # also write a CSV
 *   node scripts/audit-schedules.mjs --md report.md   # also write Markdown
 *   node scripts/audit-schedules.mjs --loan CM-LN-...  # one loan
 *
 * This script **never writes**. It issues `select` only, and the one place that
 * could be talked into anything else — the Management API SQL endpoint — is not
 * used at all. Run it, read the report, and only then decide what
 * `repair-schedules.mjs` should be allowed to do.
 *
 * It reports, per loan:
 *   · member, group, group meeting day, disbursement date
 *   · the existing schedule and the meeting-day schedule it should have had
 *   · missing instalments, duplicated week numbers, weekday drift
 *   · every receipt, and whether the receipts reconcile with the schedule
 *   · the proposed repair, and anything too ambiguous to propose one for
 *
 * Nothing here decides anything. A loan it cannot read confidently is listed
 * under AMBIGUOUS for a human, not quietly repaired.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ----------------------------------------------------------------- environment

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.\n" +
      "The audit needs the service role: row level security would otherwise hide\n" +
      "every loan belonging to another officer, and a partial audit is worse than none.",
  );
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const onlyLoan = flag("--loan");

// ----------------------------------------------------------------- date helpers
// Deliberately local to this script: the audit must not depend on the same code
// it is auditing.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const parseLocal = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toISO = (date) =>
  [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
const addDays = (iso, n) => {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const weekdayOf = (iso) => WEEKDAYS[parseLocal(iso).getDay()];

/** Mirrors `parseMeetingDay`: tolerant of case and abbreviation, refuses guesses. */
const parseMeetingDay = (value) => {
  if (!value) return null;
  const cleaned = String(value).trim().toLowerCase();
  if (!cleaned) return null;
  const exact = WEEKDAYS.findIndex((d) => d.toLowerCase() === cleaned);
  if (exact >= 0) return exact;
  const prefixed = WEEKDAYS.filter((d) => d.toLowerCase().startsWith(cleaned));
  return prefixed.length === 1 ? WEEKDAYS.indexOf(prefixed[0]) : null;
};

const nextMeetingDay = (from, weekdayIndex, minDaysAhead = 1) => {
  // Floored at one day: instalment #1 never falls on the disbursement date.
  const earliest = parseLocal(addDays(from, Math.max(1, minDaysAhead)));
  return addDays(toISO(earliest), (weekdayIndex - earliest.getDay() + 7) % 7);
};

/**
 * Days from disbursement to instalment #1, under the approved rule: the first
 * group meeting *strictly after* the money went out, with no extra week.
 *
 * Mirrors `graceDaysFor` in `src/lib/meetingDay.ts`. Restated here rather than
 * imported because the audit must not depend on the code it is auditing — if
 * the two ever disagree, `verify-schedule.mjs` section 11 fails, which is the
 * point. `loan_products.grace_period_weeks` supplies the weeks: 0, the live
 * product's value, means none.
 */
const GRACE_DAYS = 1;
const graceDaysFor = (graceWeeks) => {
  const weeks = Math.floor(Number(graceWeeks ?? 0));
  return Math.max(GRACE_DAYS, (Number.isFinite(weeks) ? Math.max(0, weeks) : 0) * 7);
};

// -------------------------------------------------------------------- fetching

/** Pages a table so the 1,000-row cap cannot truncate the audit itself. */
async function fetchAll(table, columns = "*", order = "id") {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order(order)
      .range(from, from + size - 1);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < size) break;
  }
  return rows;
}

// ----------------------------------------------------------------------- audit

const money = (n) => Number(n || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 });

async function main() {
  console.log("\nChetu repayment schedule audit — READ ONLY, no data is modified\n");
  console.log(`Project : ${url}`);
  console.log(`Run at  : ${new Date().toISOString()}`);
  console.log(
    "Rule    : instalment #1 = first group meeting strictly after disbursement" +
      " (grace_period_weeks adds whole weeks)\n",
  );

  const [loans, clients, groups, products, schedule, repayments] = await Promise.all([
    fetchAll("loans"),
    fetchAll("clients", "id, client_number, full_name, group_id, branch_id"),
    fetchAll("client_groups", "id, group_code, group_name, meeting_day, meeting_frequency"),
    fetchAll("loan_products", "id, product_name, grace_period_weeks"),
    fetchAll("loan_repayment_schedule"),
    fetchAll("loan_repayments"),
  ]);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const scheduleByLoan = new Map();
  for (const row of schedule) {
    const list = scheduleByLoan.get(row.loan_id);
    if (list) list.push(row);
    else scheduleByLoan.set(row.loan_id, [row]);
  }
  const repaymentsByLoan = new Map();
  for (const row of repayments) {
    const list = repaymentsByLoan.get(row.loan_id);
    if (list) list.push(row);
    else repaymentsByLoan.set(row.loan_id, [row]);
  }

  console.log("Portfolio");
  console.log(`  loans                 ${loans.length}`);
  console.log(`  members               ${clients.length}`);
  console.log(`  groups                ${groups.length}`);
  console.log(`  schedule rows         ${schedule.length}`);
  console.log(`  receipts              ${repayments.length}`);
  console.log(
    `  receipts with schedule_id  ${repayments.filter((r) => r.schedule_id).length} of ${repayments.length}\n`,
  );

  // Meeting-day hygiene across all groups — the audit cannot propose a
  // meeting-day schedule for a group whose meeting day is not a weekday.
  const meetingDayTally = new Map();
  const badMeetingDays = [];
  for (const g of groups) {
    const parsed = parseMeetingDay(g.meeting_day);
    const label =
      parsed === null ? `UNRECOGNISED(${JSON.stringify(g.meeting_day)})` : WEEKDAYS[parsed];
    meetingDayTally.set(label, (meetingDayTally.get(label) || 0) + 1);
    if (parsed === null) badMeetingDays.push(g);
  }
  console.log("Group meeting days");
  for (const [label, count] of [...meetingDayTally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${label}`);
  }
  const nonWeekly = groups.filter((g) => g.meeting_frequency && g.meeting_frequency !== "Weekly");
  if (nonWeekly.length) {
    console.log(
      `\n  ${nonWeekly.length} group(s) are not Weekly — excluded from weekly proposals:`,
    );
    for (const g of nonWeekly)
      console.log(`    ${g.group_code} ${g.group_name} (${g.meeting_frequency})`);
  }
  console.log("");

  const findings = [];
  const closed = ["Fully Paid", "Settled", "Written Off"];

  for (const loan of loans) {
    if (onlyLoan && loan.loan_number !== onlyLoan && loan.id !== onlyLoan) continue;

    const client = clientById.get(loan.client_id);
    const group = client?.group_id ? groupById.get(client.group_id) : null;
    const product = productById.get(loan.product_id);
    const rows = (scheduleByLoan.get(loan.id) || [])
      .slice()
      .sort((a, b) => a.week_number - b.week_number);
    const receipts = (repaymentsByLoan.get(loan.id) || [])
      .slice()
      .sort((a, b) => (a.payment_date < b.payment_date ? -1 : 1));

    const meetingIndex = parseMeetingDay(group?.meeting_day);
    const paidTotal = receipts.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    const schedulePaidTotal = rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const rowsWithPayment = rows.filter((r) => Number(r.paid_amount || 0) > 0);

    const issues = [];
    const ambiguities = [];
    const proposals = [];

    // --- structural problems -------------------------------------------------

    if (rows.length === 0 && loan.status !== "Pending") {
      issues.push("NO_SCHEDULE");
      proposals.push(`Create ${loan.loan_period_weeks} missing instalment rows`);
    }

    const weekNumbers = rows.map((r) => r.week_number);
    const duplicateWeeks = weekNumbers.filter((w, i) => weekNumbers.indexOf(w) !== i);
    if (duplicateWeeks.length) {
      issues.push(`DUPLICATE_WEEKS(${[...new Set(duplicateWeeks)].join(",")})`);
      // Never resolved automatically: picking one of two rows for the same week
      // can discard a payment. A person decides.
      ambiguities.push(
        `Weeks ${[...new Set(duplicateWeeks)].join(", ")} have more than one row — review by hand`,
      );
    }

    const expectedWeeks = Number(loan.loan_period_weeks || 0);
    const missingWeeks = [];
    if (rows.length > 0 && expectedWeeks > 0) {
      const present = new Set(weekNumbers);
      for (let w = 1; w <= expectedWeeks; w += 1) if (!present.has(w)) missingWeeks.push(w);
      if (missingWeeks.length) {
        issues.push(`MISSING_WEEKS(${missingWeeks.length})`);
        proposals.push(
          `Create instalment rows for week(s) ${missingWeeks.join(", ")}, unpaid, at their historical due dates`,
        );
      }
      if (rows.length > expectedWeeks && !duplicateWeeks.length) {
        issues.push(`EXTRA_ROWS(${rows.length - expectedWeeks})`);
        ambiguities.push(
          `${rows.length} rows for a ${expectedWeeks}-week loan — review before any change`,
        );
      }
    }

    // --- weekday drift -------------------------------------------------------

    let expectedSchedule = null;
    let driftedRows = [];
    if (meetingIndex === null) {
      if (group) {
        ambiguities.push(
          `Group ${group.group_code} meeting_day is ${JSON.stringify(group.meeting_day)} — not a weekday, no schedule can be proposed`,
        );
        issues.push("NO_MEETING_DAY");
      } else {
        ambiguities.push("Member belongs to no group — no meeting day to schedule against");
        issues.push("NO_GROUP");
      }
    } else if (group?.meeting_frequency && group.meeting_frequency !== "Weekly") {
      ambiguities.push(
        `Group ${group.group_code} meets ${group.meeting_frequency}, not Weekly — weekly proposal withheld`,
      );
      issues.push("NON_WEEKLY_GROUP");
    } else if (rows.length > 0) {
      driftedRows = rows.filter((r) => parseLocal(r.due_date).getDay() !== meetingIndex);
      if (driftedRows.length) {
        issues.push(`WEEKDAY_DRIFT(${driftedRows.length}/${rows.length})`);
      }

      // What the schedule would have been, anchored on the disbursement.
      const anchor = loan.disbursed_at ? String(loan.disbursed_at).slice(0, 10) : null;
      if (anchor) {
        const first = nextMeetingDay(
          anchor,
          meetingIndex,
          graceDaysFor(product?.grace_period_weeks),
        );
        expectedSchedule = Array.from({ length: rows.length }, (_, i) => addDays(first, i * 7));
      } else if (loan.status !== "Pending") {
        ambiguities.push("Loan is not Pending but has no disbursed_at — cannot anchor a schedule");
        issues.push("NO_DISBURSEMENT_DATE");
      }

      // A drifted row that already carries a payment is never re-dated: the
      // member paid against that date and the history stays as it is.
      const driftedAndPaid = driftedRows.filter((r) => Number(r.paid_amount || 0) > 0);
      const driftedUnpaid = driftedRows.filter((r) => Number(r.paid_amount || 0) === 0);
      if (driftedUnpaid.length) {
        proposals.push(
          `Re-date ${driftedUnpaid.length} unpaid instalment(s) onto ${WEEKDAYS[meetingIndex]}`,
        );
      }
      if (driftedAndPaid.length) {
        ambiguities.push(
          `${driftedAndPaid.length} drifted instalment(s) already carry payments — left untouched by design`,
        );
      }
    }

    // --- money reconciliation ------------------------------------------------

    const outstanding = Number(loan.outstanding_balance || 0);
    const payable = Number(loan.total_amount_payable || 0);
    const impliedOutstanding = Math.max(0, payable - paidTotal);

    if (Math.abs(schedulePaidTotal - paidTotal) >= 1) {
      issues.push("SCHEDULE_PAID_MISMATCH");
      proposals.push(
        `Re-apply ${money(paidTotal)} of receipts across the schedule (schedule currently records ${money(schedulePaidTotal)})`,
      );
    }
    if (!closed.includes(loan.status) && Math.abs(outstanding - impliedOutstanding) >= 1) {
      issues.push("OUTSTANDING_MISMATCH");
      // Reported only. The loan's outstanding balance is a financial figure;
      // the repair does not touch it.
      ambiguities.push(
        `loans.outstanding_balance is ${money(outstanding)} but payable ${money(payable)} less receipts ${money(paidTotal)} implies ${money(impliedOutstanding)} — reported only, not repaired`,
      );
    }
    if (paidTotal > payable + 1) {
      issues.push("OVERPAID");
      ambiguities.push(
        `Receipts total ${money(paidTotal)} against ${money(payable)} payable — review before any change`,
      );
    }

    const unlinked = receipts.filter((r) => !r.schedule_id);
    if (unlinked.length) {
      issues.push(`UNLINKED_RECEIPTS(${unlinked.length})`);
      // Only proposed where the allocation is unambiguous: a clean schedule and
      // receipts that reconcile. Anything else is flagged for a person.
      if (
        rows.length > 0 &&
        !duplicateWeeks.length &&
        Math.abs(schedulePaidTotal - paidTotal) < 1
      ) {
        proposals.push(
          `Backfill schedule_id on ${unlinked.length} receipt(s) by oldest-instalment-first allocation`,
        );
      } else {
        ambiguities.push(
          `${unlinked.length} receipt(s) cannot be attributed to an instalment confidently — manual review`,
        );
      }
    }

    // Legacy `remaining_balance` written under the old running-total meaning.
    const legacyBalance = rows.filter((r) => {
      const perInstallment = Math.max(
        0,
        Number(r.installment_amount || 0) - Number(r.paid_amount || 0),
      );
      return Math.abs(Number(r.remaining_balance || 0) - perInstallment) >= 1;
    });
    if (legacyBalance.length) {
      issues.push(`LEGACY_REMAINING_BALANCE(${legacyBalance.length})`);
      proposals.push(
        `Rewrite remaining_balance on ${legacyBalance.length} row(s) as installment_amount - paid_amount`,
      );
    }

    if (issues.length === 0) continue;

    findings.push({
      loan_id: loan.id,
      loan_number: loan.loan_number,
      status: loan.status,
      member: client?.full_name || "(unknown)",
      member_number: client?.client_number || "",
      group_code: group?.group_code || "(none)",
      group_name: group?.group_name || "(none)",
      meeting_day: group?.meeting_day ?? null,
      meeting_day_parsed: meetingIndex === null ? null : WEEKDAYS[meetingIndex],
      product: product?.product_name || "",
      disbursed_at: loan.disbursed_at ? String(loan.disbursed_at).slice(0, 10) : null,
      first_repayment_date: loan.first_repayment_date,
      loan_period_weeks: expectedWeeks,
      schedule_rows: rows.length,
      missing_weeks: missingWeeks,
      duplicate_weeks: [...new Set(duplicateWeeks)],
      drifted_rows: driftedRows.length,
      drifted_dates: driftedRows
        .slice(0, 8)
        .map((r) => `w${r.week_number}:${r.due_date}(${weekdayOf(r.due_date)})`),
      expected_first_due: expectedSchedule?.[0] ?? null,
      expected_schedule_head: expectedSchedule?.slice(0, 6) ?? [],
      existing_schedule_head: rows.slice(0, 6).map((r) => `w${r.week_number}:${r.due_date}`),
      receipts_count: receipts.length,
      receipts_total: paidTotal,
      schedule_paid_total: schedulePaidTotal,
      rows_with_payment: rowsWithPayment.length,
      outstanding_balance: outstanding,
      total_amount_payable: payable,
      implied_outstanding: impliedOutstanding,
      unlinked_receipts: unlinked.length,
      issues,
      proposals,
      ambiguities,
    });
  }

  // ------------------------------------------------------------------ reporting

  const withIssues = findings.length;
  const repairable = findings.filter((f) => f.proposals.length > 0 && f.ambiguities.length === 0);
  const needsReview = findings.filter((f) => f.ambiguities.length > 0);
  const totalMissing = findings.reduce((s, f) => s + f.missing_weeks.length, 0);
  const totalDrift = findings.filter((f) => f.drifted_rows > 0).length;
  const totalDuplicates = findings.filter((f) => f.duplicate_weeks.length > 0).length;

  console.log("=".repeat(78));
  console.log("SUMMARY");
  console.log("=".repeat(78));
  console.log(`  loans audited                       ${loans.length}`);
  console.log(`  loans with at least one finding     ${withIssues}`);
  console.log(`  loans repairable without review     ${repairable.length}`);
  console.log(`  loans needing manual review         ${needsReview.length}`);
  console.log(`  missing instalment rows in total    ${totalMissing}`);
  console.log(`  loans with weekday drift            ${totalDrift}`);
  console.log(`  loans with duplicated week numbers  ${totalDuplicates}`);
  console.log(`  groups with an unusable meeting day ${badMeetingDays.length}`);
  console.log(`  receipts in the portfolio           ${repayments.length}  (never modified)`);
  console.log("");

  const issueTally = new Map();
  for (const f of findings) {
    for (const issue of f.issues) {
      const key = issue.replace(/\(.*\)$/, "");
      issueTally.set(key, (issueTally.get(key) || 0) + 1);
    }
  }
  if (issueTally.size) {
    console.log("FINDINGS BY TYPE");
    for (const [key, count] of [...issueTally].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(5)}  ${key}`);
    }
    console.log("");
  }

  for (const f of findings) {
    console.log("-".repeat(78));
    console.log(`${f.loan_number}  ${f.member} (${f.member_number})  [${f.status}]`);
    console.log(`  group          ${f.group_code} ${f.group_name}`);
    console.log(
      `  meeting day    ${JSON.stringify(f.meeting_day)}${f.meeting_day_parsed ? ` → ${f.meeting_day_parsed}` : "  (UNUSABLE)"}`,
    );
    console.log(`  disbursed      ${f.disbursed_at || "(none)"}`);
    console.log(`  term           ${f.loan_period_weeks} weeks, ${f.schedule_rows} schedule rows`);
    console.log(
      `  first repay    stored ${f.first_repayment_date}  expected ${f.expected_first_due || "(n/a)"}`,
    );
    if (f.existing_schedule_head.length)
      console.log(`  existing       ${f.existing_schedule_head.join("  ")}`);
    if (f.expected_schedule_head.length)
      console.log(`  expected       ${f.expected_schedule_head.join("  ")}`);
    if (f.missing_weeks.length) console.log(`  missing weeks  ${f.missing_weeks.join(", ")}`);
    if (f.drifted_rows)
      console.log(`  drifted        ${f.drifted_rows} row(s): ${f.drifted_dates.join("  ")}`);
    console.log(
      `  money          receipts ${money(f.receipts_total)} (${f.receipts_count})  schedule paid ${money(f.schedule_paid_total)}  outstanding ${money(f.outstanding_balance)}  implied ${money(f.implied_outstanding)}`,
    );
    console.log(`  issues         ${f.issues.join(", ")}`);
    for (const p of f.proposals) console.log(`  PROPOSE        ${p}`);
    for (const a of f.ambiguities) console.log(`  AMBIGUOUS      ${a}`);
  }

  if (findings.length) console.log("-".repeat(78));
  console.log("\nNo data was modified. This script only reads.\n");

  // ------------------------------------------------------------------- exports

  const csvPath = flag("--csv");
  if (typeof csvPath === "string") {
    const columns = [
      "loan_number",
      "member",
      "member_number",
      "group_code",
      "group_name",
      "meeting_day",
      "meeting_day_parsed",
      "status",
      "disbursed_at",
      "first_repayment_date",
      "expected_first_due",
      "loan_period_weeks",
      "schedule_rows",
      "missing_weeks",
      "duplicate_weeks",
      "drifted_rows",
      "receipts_count",
      "receipts_total",
      "schedule_paid_total",
      "outstanding_balance",
      "implied_outstanding",
      "unlinked_receipts",
      "issues",
      "proposals",
      "ambiguities",
    ];
    const cell = (v) => {
      const s = Array.isArray(v) ? v.join(" | ") : v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      columns.join(","),
      ...findings.map((f) => columns.map((c) => cell(f[c])).join(",")),
    ].join("\n");
    writeFileSync(csvPath, csv);
    console.log(`CSV written to ${csvPath}`);
  }

  const mdPath = flag("--md");
  if (typeof mdPath === "string") {
    const lines = [
      "# Chetu repayment schedule audit",
      "",
      `Generated ${new Date().toISOString()} — read-only, no data modified.`,
      "",
      "## Summary",
      "",
      "| Measure | Count |",
      "| --- | ---: |",
      `| Loans audited | ${loans.length} |`,
      `| Loans with findings | ${withIssues} |`,
      `| Repairable without review | ${repairable.length} |`,
      `| Needing manual review | ${needsReview.length} |`,
      `| Missing instalment rows | ${totalMissing} |`,
      `| Loans with weekday drift | ${totalDrift} |`,
      `| Loans with duplicate weeks | ${totalDuplicates} |`,
      `| Groups with unusable meeting day | ${badMeetingDays.length} |`,
      `| Receipts (never modified) | ${repayments.length} |`,
      "",
      "## Findings",
      "",
      "| Loan | Member | Group | Meeting day | Disbursed | Missing | Drift | Receipts | Proposed repair | Ambiguous |",
      "| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
      ...findings.map((f) =>
        [
          f.loan_number,
          f.member,
          f.group_code,
          f.meeting_day_parsed || `\`${JSON.stringify(f.meeting_day)}\``,
          f.disbursed_at || "—",
          f.missing_weeks.length,
          f.drifted_rows,
          f.receipts_count,
          f.proposals.join("; ") || "—",
          f.ambiguities.join("; ") || "—",
        ]
          .map((v) => String(v).replace(/\|/g, "\\|"))
          .join(" | ")
          .replace(/^/, "| ")
          .replace(/$/, " |"),
      ),
    ];
    writeFileSync(mdPath, lines.join("\n"));
    console.log(`Markdown written to ${mdPath}`);
  }

  // A findings JSON alongside, for repair-schedules.mjs to read back.
  const jsonPath = flag("--json");
  if (typeof jsonPath === "string") {
    writeFileSync(
      jsonPath,
      JSON.stringify({ generated: new Date().toISOString(), findings }, null, 2),
    );
    console.log(`JSON written to ${jsonPath}`);
  }
}

main().catch((error) => {
  console.error(`\nAudit failed: ${error.message}\n`);
  process.exit(1);
});
