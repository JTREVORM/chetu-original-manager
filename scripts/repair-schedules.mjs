#!/usr/bin/env node
/**
 * Repairs repayment SCHEDULES. Dry run unless told otherwise, twice.
 *
 *   node scripts/repair-schedules.mjs                     # dry run (default)
 *   node scripts/repair-schedules.mjs --loan CM-LN-2026-0001
 *   node scripts/repair-schedules.mjs --apply --i-have-reviewed-the-audit
 *
 * WHAT THIS MAY CHANGE, and only in `loan_repayment_schedule`:
 *   · insert an instalment row that should exist and does not
 *   · move the due date of an instalment that carries NO payment
 *   · rewrite paid_amount / remaining_balance / status from the receipts that
 *     already exist
 *   · set loan_repayments.schedule_id, a nullable link column
 *
 * WHAT THIS NEVER CHANGES — enforced below, not merely intended:
 *   · no INSERT, UPDATE or DELETE of a receipt's money, date, method, receipt
 *     number, collector or notes
 *   · no loan principal, interest, fee, payable or outstanding balance
 *   · no bank, cash or ledger transaction
 *   · no row is ever deleted, in any table
 *   · no instalment is marked paid without a receipt to account for it
 *   · no due date that a payment is attached to is moved
 *
 * A loan the audit flagged AMBIGUOUS is skipped, always. Ambiguity is resolved
 * by a person, not by this script.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

// --------------------------------------------------------------------- guards

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};

// Two independent flags. `--apply` alone does nothing: a stray flag in shell
// history, or a copied command, cannot start a production write.
const APPLY = has("--apply") && has("--i-have-reviewed-the-audit");

const INVOKED_DIRECTLY =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (INVOKED_DIRECTLY && has("--apply") && !APPLY) {
  console.error(
    "\n--apply was given without --i-have-reviewed-the-audit.\n" +
      "Nothing has been done. Run the audit, read it, then pass both flags:\n\n" +
      "  node scripts/audit-schedules.mjs --md audit.md\n" +
      "  node scripts/repair-schedules.mjs --apply --i-have-reviewed-the-audit\n",
  );
  process.exit(2);
}

const onlyLoan = flag("--loan");

/**
 * Opened inside `main` rather than at import, so `planForLoan` can be exercised
 * by `verify-schedule.mjs` without credentials and without a network call.
 */
let db = null;
let url = null;

function connect() {
  const env = Object.fromEntries(
    readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => [
        line.slice(0, line.indexOf("=")).trim(),
        line.slice(line.indexOf("=") + 1).trim(),
      ]),
  );
  url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(2);
  }
  db = createClient(url, key, { auth: { persistSession: false } });
}

// -------------------------------------------------------------- date helpers

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
const parseMeetingDay = (value) => {
  if (!value) return null;
  const cleaned = String(value).trim().toLowerCase();
  if (!cleaned) return null;
  const exact = WEEKDAYS.findIndex((d) => d.toLowerCase() === cleaned);
  if (exact >= 0) return exact;
  const prefixed = WEEKDAYS.filter((d) => d.toLowerCase().startsWith(cleaned));
  return prefixed.length === 1 ? WEEKDAYS.indexOf(prefixed[0]) : null;
};
const nextMeetingDay = (from, weekdayIndex, minDaysAhead = 7) => {
  const earliest = parseLocal(addDays(from, minDaysAhead));
  return addDays(toISO(earliest), (weekdayIndex - earliest.getDay() + 7) % 7);
};
const GRACE_DAYS = 7;
const money = (n) => Number(n || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 });

// ------------------------------------------------------------------- fetching

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

// ---------------------------------------------------------------------- plans

/**
 * Every intended change, as data. Nothing is executed while the plan is built,
 * so the dry run and the apply run decide identically.
 */
export function planForLoan({ loan, client, group, rows, receipts }) {
  const plan = { loan, client, group, actions: [], skips: [] };
  const skip = (why) => plan.skips.push(why);

  if (loan.status === "Pending") {
    skip("loan is not disbursed");
    return plan;
  }

  const meetingIndex = parseMeetingDay(group?.meeting_day);
  const ordered = rows.slice().sort((a, b) => a.week_number - b.week_number);
  const weekNumbers = ordered.map((r) => r.week_number);
  const duplicates = [...new Set(weekNumbers.filter((w, i) => weekNumbers.indexOf(w) !== i))];

  // Ambiguity stops everything for this loan — not just the ambiguous part.
  if (duplicates.length) {
    skip(`duplicate week numbers ${duplicates.join(", ")} — manual review required`);
    return plan;
  }
  if (!group) {
    skip("member belongs to no group");
    return plan;
  }
  if (meetingIndex === null) {
    skip(`group meeting_day ${JSON.stringify(group.meeting_day)} is not a weekday`);
    return plan;
  }
  if (group.meeting_frequency && group.meeting_frequency !== "Weekly") {
    skip(`group meets ${group.meeting_frequency}, not Weekly`);
    return plan;
  }
  if (!loan.disbursed_at) {
    skip("no disbursed_at to anchor a schedule against");
    return plan;
  }

  const receiptsTotal = receipts.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const payable = Number(loan.total_amount_payable || 0);
  if (receiptsTotal > payable + 1) {
    skip(`receipts ${money(receiptsTotal)} exceed payable ${money(payable)} — manual review`);
    return plan;
  }

  const anchor = String(loan.disbursed_at).slice(0, 10);
  const firstDue = nextMeetingDay(anchor, meetingIndex, GRACE_DAYS);
  const expectedWeeks = Number(loan.loan_period_weeks || 0);

  // 1. Missing instalment rows, created unpaid at their historical due date.
  const present = new Map(ordered.map((r) => [r.week_number, r]));
  const weekly = Number(loan.weekly_installment || 0);
  for (let week = 1; week <= expectedWeeks; week += 1) {
    if (present.has(week)) continue;
    const due = addDays(firstDue, (week - 1) * 7);
    plan.actions.push({
      kind: "insert_installment",
      week,
      due,
      // Amounts come from the loan's own stored figures, never recomputed from
      // today's fee schedule or interest rate.
      amount: weekly,
      why: `week ${week} has no schedule row`,
      // Created unpaid. It becomes overdue or pending under the ordinary rules;
      // it is never marked paid without a receipt.
      row: {
        loan_id: loan.id,
        week_number: week,
        due_date: due,
        installment_amount: weekly,
        principal_portion: 0,
        interest_portion: 0,
        paid_amount: 0,
        remaining_balance: weekly,
        status: "Pending",
      },
    });
  }

  // 2. Weekday drift on instalments that carry no payment.
  for (const row of ordered) {
    const shouldBe = addDays(firstDue, (row.week_number - 1) * 7);
    if (row.due_date === shouldBe) continue;
    if (Number(row.paid_amount || 0) > 0) {
      plan.skips.push(
        `week ${row.week_number} is on ${row.due_date} instead of ${shouldBe} but carries a payment — left as it is`,
      );
      continue;
    }
    plan.actions.push({
      kind: "redate_installment",
      id: row.id,
      week: row.week_number,
      from: row.due_date,
      due: shouldBe,
      why: `unpaid instalment is a ${WEEKDAYS[parseLocal(row.due_date).getDay()]}, group meets ${WEEKDAYS[meetingIndex]}`,
    });
  }

  // 3. Re-apply the receipts that exist across the schedule, oldest first.
  //    This reconciles paid_amount / remaining_balance / status with the money
  //    actually received. It invents nothing: the total applied can never
  //    exceed the sum of the receipts.
  const projected = ordered
    .map((r) => ({ ...r }))
    .concat(
      plan.actions
        .filter((a) => a.kind === "insert_installment")
        .map((a) => ({ ...a.row, id: null })),
    );
  for (const row of projected) {
    const action = plan.actions.find((a) => a.kind === "redate_installment" && a.id === row.id);
    if (action) row.due_date = action.due;
  }
  projected.sort((a, b) =>
    a.due_date === b.due_date ? a.week_number - b.week_number : a.due_date < b.due_date ? -1 : 1,
  );

  let remaining = receiptsTotal;
  const allocationByWeek = new Map();
  for (const row of projected) {
    const expected = Number(row.installment_amount || 0);
    const applied = Math.min(Math.max(0, remaining), expected);
    remaining -= applied;
    allocationByWeek.set(row.week_number, applied);

    const balance = Math.max(0, expected - applied);
    const status = balance < 1 ? "Paid" : applied > 0 ? "Partially Paid" : "Pending";

    if (!row.id) continue; // a row being inserted already carries these values
    const changed =
      Math.abs(Number(row.paid_amount || 0) - applied) >= 1 ||
      Math.abs(Number(row.remaining_balance || 0) - balance) >= 1 ||
      row.status !== status;
    if (!changed) continue;

    plan.actions.push({
      kind: "reconcile_installment",
      id: row.id,
      week: row.week_number,
      from: {
        paid: Number(row.paid_amount || 0),
        balance: Number(row.remaining_balance || 0),
        status: row.status,
      },
      to: { paid: applied, balance, status },
      why: "schedule did not match the receipts on this loan",
    });
  }

  if (remaining >= 1) {
    plan.skips.push(
      `${money(remaining)} of receipts cannot be placed on any instalment — reported, not forced`,
    );
  }

  // 4. Backfill schedule_id, only where allocation was unambiguous.
  const unlinked = receipts.filter((r) => !r.schedule_id);
  if (unlinked.length) {
    if (remaining >= 1) {
      plan.skips.push(`${unlinked.length} receipt(s) left unlinked — allocation did not reconcile`);
    } else {
      // Walk the receipts in payment order and hand each the oldest instalment
      // it still has room in — the same rule recordRepayment now applies.
      const capacity = projected.map((row) => ({
        week: row.week_number,
        id: row.id,
        room: allocationByWeek.get(row.week_number) || 0,
      }));
      let cursor = 0;
      for (const receipt of unlinked
        .slice()
        .sort((a, b) => (a.payment_date < b.payment_date ? -1 : 1))) {
        let amount = Number(receipt.amount_paid || 0);
        let target = null;
        while (cursor < capacity.length && amount > 0) {
          if (capacity[cursor].room <= 0) {
            cursor += 1;
            continue;
          }
          if (target === null) target = capacity[cursor];
          const take = Math.min(amount, capacity[cursor].room);
          capacity[cursor].room -= take;
          amount -= take;
          if (capacity[cursor].room <= 0) cursor += 1;
        }
        if (!target || !target.id) {
          plan.skips.push(
            `receipt ${receipt.receipt_number} could not be attributed to an instalment — left unlinked`,
          );
          continue;
        }
        plan.actions.push({
          kind: "link_receipt",
          receiptId: receipt.id,
          receiptNumber: receipt.receipt_number,
          scheduleId: target.id,
          week: target.week,
          why: "receipt had no schedule_id",
        });
      }
    }
  }

  return plan;
}

// ----------------------------------------------------------------------- main

async function main() {
  connect();
  console.log("");
  console.log("=".repeat(78));
  if (APPLY) {
    console.log("APPLY MODE — SCHEDULE CHANGES WILL BE WRITTEN TO THE DATABASE");
    console.log("Receipts, loan amounts and ledger entries are NOT touched.");
  } else {
    console.log("DRY RUN — NO DATABASE CHANGES WILL BE MADE");
    console.log("Pass --apply --i-have-reviewed-the-audit to write these changes.");
  }
  console.log("=".repeat(78));
  console.log(`\nProject : ${url}`);
  console.log(`Run at  : ${new Date().toISOString()}\n`);

  const [loans, clients, groups, schedule, repayments] = await Promise.all([
    fetchAll("loans"),
    fetchAll("clients", "id, client_number, full_name, group_id"),
    fetchAll("client_groups", "id, group_code, group_name, meeting_day, meeting_frequency"),
    fetchAll("loan_repayment_schedule"),
    fetchAll("loan_repayments"),
  ]);

  // The receipt ledger is fingerprinted before and after, so an apply run can
  // prove it changed nothing financial rather than merely promising it.
  const ledgerFingerprint = (rows) =>
    JSON.stringify(
      rows
        .map((r) => [
          r.id,
          r.amount_paid,
          r.payment_date,
          r.payment_method,
          r.receipt_number,
          r.loan_id,
        ])
        .sort(),
    );
  const beforeFingerprint = ledgerFingerprint(repayments);
  const beforeTotal = repayments.reduce((s, r) => s + Number(r.amount_paid || 0), 0);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
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

  const plans = [];
  for (const loan of loans) {
    if (onlyLoan && loan.loan_number !== onlyLoan && loan.id !== onlyLoan) continue;
    const client = clientById.get(loan.client_id);
    const plan = planForLoan({
      loan,
      client,
      group: client?.group_id ? groupById.get(client.group_id) : null,
      rows: scheduleByLoan.get(loan.id) || [],
      receipts: repaymentsByLoan.get(loan.id) || [],
    });
    if (plan.actions.length || plan.skips.length) plans.push(plan);
  }

  const tally = {
    insert_installment: 0,
    redate_installment: 0,
    reconcile_installment: 0,
    link_receipt: 0,
  };
  for (const plan of plans) for (const a of plan.actions) tally[a.kind] += 1;
  const touchedLoans = plans.filter((p) => p.actions.length).length;
  const skippedLoans = plans.filter((p) => !p.actions.length && p.skips.length).length;

  for (const plan of plans) {
    if (!plan.actions.length && !plan.skips.length) continue;
    console.log("-".repeat(78));
    console.log(
      `${plan.loan.loan_number}  ${plan.client?.full_name || "(unknown member)"}  [${plan.loan.status}]  ` +
        `${plan.group?.group_code || "(no group)"} ${plan.group?.meeting_day ?? ""}`,
    );
    for (const a of plan.actions) {
      if (a.kind === "insert_installment") {
        console.log(
          `  + INSERT  week ${a.week} due ${a.due} amount ${money(a.amount)} unpaid — ${a.why}`,
        );
      } else if (a.kind === "redate_installment") {
        console.log(`  ~ REDATE  week ${a.week} ${a.from} → ${a.due} — ${a.why}`);
      } else if (a.kind === "reconcile_installment") {
        console.log(
          `  ~ RECONC  week ${a.week} paid ${money(a.from.paid)}→${money(a.to.paid)} ` +
            `balance ${money(a.from.balance)}→${money(a.to.balance)} ${a.from.status}→${a.to.status}`,
        );
      } else if (a.kind === "link_receipt") {
        console.log(`  ~ LINK    receipt ${a.receiptNumber} → week ${a.week} — ${a.why}`);
      }
    }
    for (const s of plan.skips) console.log(`  · SKIP    ${s}`);
  }

  if (plans.length) console.log("-".repeat(78));
  console.log("\nPLAN");
  console.log(`  loans with changes planned   ${touchedLoans}`);
  console.log(`  loans skipped for review     ${skippedLoans}`);
  console.log(`  instalments to insert        ${tally.insert_installment}`);
  console.log(`  instalments to re-date       ${tally.redate_installment}`);
  console.log(`  instalments to reconcile     ${tally.reconcile_installment}`);
  console.log(`  receipts to link             ${tally.link_receipt}`);
  console.log(`  receipts to create/modify    0  (this script cannot)`);
  console.log(`  rows to delete               0  (this script cannot)`);
  console.log("");

  if (!APPLY) {
    console.log("DRY RUN — nothing was written.\n");
    return;
  }

  // ------------------------------------------------------------------- apply

  let applied = 0;
  let failed = 0;

  for (const plan of plans) {
    for (const a of plan.actions) {
      try {
        if (a.kind === "insert_installment") {
          const { error } = await db.from("loan_repayment_schedule").insert(a.row);
          if (error) throw new Error(error.message);
        } else if (a.kind === "redate_installment") {
          // Re-asserts the no-payment condition at write time, against the
          // live row: the read that built the plan may be minutes old.
          const { data, error: readError } = await db
            .from("loan_repayment_schedule")
            .select("paid_amount")
            .eq("id", a.id)
            .single();
          if (readError) throw new Error(readError.message);
          if (Number(data?.paid_amount || 0) > 0) {
            console.log(`  ! SKIP    week ${a.week} now carries a payment — not re-dated`);
            continue;
          }
          const { error } = await db
            .from("loan_repayment_schedule")
            .update({ due_date: a.due })
            .eq("id", a.id);
          if (error) throw new Error(error.message);
        } else if (a.kind === "reconcile_installment") {
          const { error } = await db
            .from("loan_repayment_schedule")
            .update({
              paid_amount: a.to.paid,
              remaining_balance: a.to.balance,
              status: a.to.status,
            })
            .eq("id", a.id);
          if (error) throw new Error(error.message);
        } else if (a.kind === "link_receipt") {
          // The only column this script writes outside the schedule table, and
          // it is a nullable link. No money, date or reference is touched.
          const { error } = await db
            .from("loan_repayments")
            .update({ schedule_id: a.scheduleId })
            .eq("id", a.receiptId);
          if (error) throw new Error(error.message);
        }
        applied += 1;
      } catch (error) {
        failed += 1;
        console.error(`  FAILED  ${plan.loan.loan_number} ${a.kind}: ${error.message}`);
      }
    }
  }

  // Prove the financial ledger is untouched.
  const after = await fetchAll("loan_repayments");
  const afterTotal = after.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const ledgerIntact =
    after.length === repayments.length &&
    Math.abs(afterTotal - beforeTotal) < 0.01 &&
    ledgerFingerprint(after) === beforeFingerprint;

  console.log("\nAPPLIED");
  console.log(`  changes written              ${applied}`);
  console.log(`  changes failed               ${failed}`);
  console.log(`  receipts before / after      ${repayments.length} / ${after.length}`);
  console.log(`  receipt total before / after ${money(beforeTotal)} / ${money(afterTotal)}`);
  console.log(`  financial ledger unchanged   ${ledgerIntact ? "YES" : "NO — INVESTIGATE"}`);
  console.log("");

  if (!ledgerIntact) process.exit(1);
}

// Only run when invoked directly. Imported — by the verification harness — the
// module exposes `planForLoan` and touches nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nRepair failed: ${error.message}\n`);
    process.exit(1);
  });
}
