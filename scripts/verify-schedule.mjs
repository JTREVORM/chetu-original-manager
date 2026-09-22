#!/usr/bin/env node
/**
 * Weekly repayment date checks.
 *
 * The repository has no test runner, so this is a plain Node script: it asserts
 * the schedule rules and exits non-zero on the first failure.
 *
 *   node scripts/verify-schedule.mjs
 *
 * It touches no database and reads no credentials.
 *
 * Sections 1-10 restate the date arithmetic independently, so a disagreement
 * with the shipped code is a real signal rather than a tautology. Section 11
 * then compiles `src/lib/meetingDay.ts` and `src/lib/scheduleView.ts` and runs
 * the same cases through the functions the application actually calls.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let checks = 0;
let failures = 0;

function check(label, actual, expected) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) return;
  failures += 1;
  console.error(`  FAIL  ${label}\n        expected ${e}\n        actual   ${a}`);
}

function assert(label, condition, detail = "") {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
}

// --------------------------------------------------------------- date helpers

/** Parses `yyyy-MM-dd` at local midnight — never through UTC. */
const parseLocal = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const toISO = (date) => {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (iso, days) => {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
};

const weekdayOf = (iso) => WEEKDAYS[parseLocal(iso).getDay()];

/**
 * The first `weekday` at least `minDaysAhead` days after `from`.
 *
 * The default is one day, not seven: instalment #1 is the first group meeting
 * strictly after disbursement. A same-day first instalment stays impossible
 * because the count starts the day after the money went out.
 */
const nextMeetingDay = (from, weekday, minDaysAhead = 1) => {
  const target = WEEKDAYS.indexOf(weekday);
  if (target < 0) throw new Error(`Not a weekday: ${weekday}`);
  const earliest = parseLocal(addDays(from, Math.max(1, minDaysAhead)));
  const shift = (target - earliest.getDay() + 7) % 7;
  return addDays(toISO(earliest), shift);
};

const weeklyDueDates = (firstDue, count) =>
  Array.from({ length: count }, (_, i) => addDays(firstDue, i * 7));

// ------------------------------------------------------------------- the runs

console.log("\nWeekly repayment schedule checks\n");

// 1. The Tuesday case from the specification, date for date.
console.log("Tuesday group, disbursed Tuesday 22 September 2026");
{
  const first = nextMeetingDay("2026-09-22", "Tuesday");
  check("first repayment", first, "2026-09-29");
  check("first repayment falls on", weekdayOf(first), "Tuesday");
  check("the run", weeklyDueDates(first, 7), [
    "2026-09-29",
    "2026-10-06",
    "2026-10-13",
    "2026-10-20",
    "2026-10-27",
    "2026-11-03",
    "2026-11-10",
  ]);
}

// 2. The same for a Friday group — nothing is hardcoded to Tuesday.
console.log("Friday group, disbursed Friday 25 September 2026");
{
  const first = nextMeetingDay("2026-09-25", "Friday");
  check("first repayment", first, "2026-10-02");
  check("the run", weeklyDueDates(first, 7), [
    "2026-10-02",
    "2026-10-09",
    "2026-10-16",
    "2026-10-23",
    "2026-10-30",
    "2026-11-06",
    "2026-11-13",
  ]);
}

// 3. Every weekday holds its day for a full 26-week cycle.
console.log("All seven meeting days hold across a 26-week cycle");
for (const weekday of WEEKDAYS) {
  const first = nextMeetingDay("2026-09-22", weekday);
  const run = weeklyDueDates(first, 26);
  assert(`${weekday}: first instalment is a ${weekday}`, weekdayOf(first) === weekday);
  assert(
    `${weekday}: all 26 instalments stay on ${weekday}`,
    run.every((d) => weekdayOf(d) === weekday),
    run.filter((d) => weekdayOf(d) !== weekday).join(", "),
  );
  // Strictly after the disbursement, and never more than a full week out:
  // the first meeting of that weekday, whichever day it falls on. Tuesday —
  // the anchor's own weekday — is the one that goes the full seven days,
  // because a same-day first instalment is not allowed.
  const daysOut = (parseLocal(first) - parseLocal("2026-09-22")) / 86400000;
  assert(
    `${weekday}: first instalment is strictly after disbursement`,
    daysOut >= 1,
    `was ${daysOut} days`,
  );
  assert(
    `${weekday}: first instalment is the next such meeting, within a week`,
    daysOut <= 7,
    `was ${daysOut} days`,
  );
}

// 4. Month lengths: 28-day February, 29-day February, 30- and 31-day months.
console.log("Month lengths");
{
  // February 2026 has 28 days; February 2028 has 29.
  const feb28 = weeklyDueDates(nextMeetingDay("2026-02-03", "Tuesday"), 8);
  check("28-day February run", feb28, [
    "2026-02-10",
    "2026-02-17",
    "2026-02-24",
    "2026-03-03",
    "2026-03-10",
    "2026-03-17",
    "2026-03-24",
    "2026-03-31",
  ]);
  assert(
    "28-day February stays Tuesday",
    feb28.every((d) => weekdayOf(d) === "Tuesday"),
  );

  const leap = weeklyDueDates(nextMeetingDay("2028-02-01", "Tuesday"), 8);
  assert(
    "29-day February stays Tuesday",
    leap.every((d) => weekdayOf(d) === "Tuesday"),
  );
  assert("29 February 2028 exists", parseLocal("2028-02-29").getDate() === 29);
  assert(
    "a run crossing 29 February keeps its weekday",
    weeklyDueDates("2028-02-22", 3).every((d) => weekdayOf(d) === "Tuesday"),
    weeklyDueDates("2028-02-22", 3).join(", "),
  );

  // April has 30 days, May 31.
  const across = weeklyDueDates("2026-04-21", 8);
  assert(
    "30- and 31-day months keep the weekday",
    across.every((d) => weekdayOf(d) === "Tuesday"),
  );
}

// 5. Month and year transitions.
console.log("Month and year transitions");
{
  check("September to October", weeklyDueDates("2026-09-29", 2), ["2026-09-29", "2026-10-06"]);
  check("October to November", weeklyDueDates("2026-10-27", 2), ["2026-10-27", "2026-11-03"]);
  const yearEnd = weeklyDueDates("2026-12-15", 5);
  check("December into January", yearEnd, [
    "2026-12-15",
    "2026-12-22",
    "2026-12-29",
    "2027-01-05",
    "2027-01-12",
  ]);
  assert(
    "year boundary keeps the weekday",
    yearEnd.every((d) => weekdayOf(d) === "Tuesday"),
  );

  // A full 52-week year from a leap-year start.
  const year = weeklyDueDates("2028-01-04", 52);
  assert(
    "52 weeks from a leap year stay Tuesday",
    year.every((d) => weekdayOf(d) === "Tuesday"),
  );
  check("52nd instalment", year[51], "2028-12-26");
}

// 6. Disbursement on a day other than the meeting day.
console.log("Disbursement away from the meeting day");
{
  // Tuesday group, cash out on Thursday 24 September 2026. The approved rule
  // takes the *next* Tuesday — five days later — not the Tuesday after next.
  // Chetu's own receipts settle this: of the eleven collected before the
  // audit, ten fell on the first meeting after disbursement and none a week
  // later.
  const first = nextMeetingDay("2026-09-24", "Tuesday");
  check("Thursday disbursement, Tuesday group", first, "2026-09-29");
  assert(
    "strictly after the money, never the same day",
    (parseLocal(first) - parseLocal("2026-09-24")) / 86400000 >= 1,
  );

  // Disbursed the day before the meeting: the very next day's meeting counts.
  check(
    "Monday disbursement, Tuesday group",
    nextMeetingDay("2026-09-21", "Tuesday"),
    "2026-09-22",
  );

  // Disbursed ON the meeting day: the only case where the old seven-day rule
  // and the approved rule agree, and the reason the error went unnoticed.
  check(
    "Tuesday disbursement, Tuesday group, skips to the following week",
    nextMeetingDay("2026-09-22", "Tuesday"),
    "2026-09-29",
  );

  // A full week of grace is still expressible, for a product that sets one.
  check(
    "grace_period_weeks = 1 restores the old date",
    nextMeetingDay("2026-09-24", "Tuesday", 7),
    "2026-10-06",
  );
}

// 7. Timezone independence. The schedule is calendar days; the machine's zone
//    must not shift a due date. This is re-run as a child process per zone.
console.log("Timezone independence");
{
  const { execFileSync } = await import("node:child_process");
  const probe = `
    const WEEKDAYS=${JSON.stringify(WEEKDAYS)};
    const parseLocal=(iso)=>{const [y,m,d]=iso.split("-").map(Number);return new Date(y,m-1,d);};
    const toISO=(d)=>[String(d.getFullYear()).padStart(4,"0"),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
    const addDays=(iso,n)=>{const d=parseLocal(iso);d.setDate(d.getDate()+n);return toISO(d);};
    const run=Array.from({length:7},(_,i)=>addDays("2026-09-29",i*7));
    console.log(JSON.stringify({run,days:run.map(d=>WEEKDAYS[parseLocal(d).getDay()])}));
  `;
  const zones = ["UTC", "Africa/Kampala", "America/Los_Angeles", "Pacific/Kiritimati"];
  const results = zones.map((tz) =>
    execFileSync(process.execPath, ["-e", probe], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    }).trim(),
  );
  zones.forEach((tz, i) => {
    const { run, days } = JSON.parse(results[i]);
    assert(
      `${tz}: every instalment is a Tuesday`,
      days.every((d) => d === "Tuesday"),
      days.join(),
    );
    check(`${tz}: first instalment`, run[0], "2026-09-29");
  });
  assert(
    "every timezone produces an identical schedule",
    new Set(results).size === 1,
    results.join("\n        "),
  );
}

// 8. Payment situations against a schedule.
console.log("Repayment situations");
{
  const weekly = 50_000;
  const schedule = weeklyDueDates("2026-09-29", 4).map((due, i) => ({
    week_number: i + 1,
    due_date: due,
    installment_amount: weekly,
    paid_amount: 0,
  }));

  // Mirrors summariseSchedule / deriveInstallment.
  const derive = (row, asOf) => {
    const balance = Math.max(0, row.installment_amount - row.paid_amount);
    const settled = balance < 1;
    let status;
    if (settled) status = "Paid";
    else if (row.due_date < asOf) status = "Overdue";
    else if (row.due_date === asOf) status = "Due";
    else status = row.paid_amount > 0 ? "Partially Paid" : "Pending";
    return { balance, status };
  };
  const statuses = (rows, asOf) => rows.map((r) => derive(r, asOf).status);

  // Normal payment: week 1 paid in full on its due date.
  const normal = schedule.map((r) => ({ ...r }));
  normal[0].paid_amount = weekly;
  check("normal weekly payment", statuses(normal, "2026-09-29"), [
    "Paid",
    "Pending",
    "Pending",
    "Pending",
  ]);

  // The specification's worked example, read a fortnight later.
  check("the example table", statuses(normal, "2026-10-13"), ["Paid", "Overdue", "Due", "Pending"]);

  // Missed payment: week 1 unpaid keeps its own due date and goes overdue.
  check("missed payment stays at its own date", statuses(schedule, "2026-10-06"), [
    "Overdue",
    "Due",
    "Pending",
    "Pending",
  ]);
  check("the missed instalment keeps 29 Sep", schedule[0].due_date, "2026-09-29");

  // Partial payment: 30,000 of 50,000 is not fully paid.
  const partial = schedule.map((r) => ({ ...r }));
  partial[0].paid_amount = 30_000;
  const p0 = derive(partial[0], "2026-09-29");
  check("partial payment is not Paid", p0.status, "Due");
  check("partial payment leaves 20,000", p0.balance, 20_000);
  check("partial payment once late", derive(partial[0], "2026-10-06").status, "Overdue");

  // Late payment: paid after the due date, still Paid, date unchanged.
  const late = schedule.map((r) => ({ ...r }));
  late[0].paid_amount = weekly;
  check("late payment settles the week", derive(late[0], "2026-10-06").status, "Paid");
  check("late payment does not move the due date", late[0].due_date, "2026-09-29");

  // Fully paid loan.
  const done = schedule.map((r) => ({ ...r, paid_amount: weekly }));
  check("fully paid loan", statuses(done, "2026-11-01"), ["Paid", "Paid", "Paid", "Paid"]);
  check(
    "fully paid loan owes nothing",
    done.reduce((s, r) => s + derive(r, "2026-11-01").balance, 0),
    0,
  );
}

// 9. Oldest-first allocation, matching allocatePayment.
console.log("Payment allocation");
{
  const rows = weeklyDueDates("2026-09-29", 3).map((due, i) => ({
    id: `s${i + 1}`,
    week_number: i + 1,
    due_date: due,
    installment_amount: 50_000,
    paid_amount: 0,
  }));

  const allocate = (schedule, amount) => {
    let remaining = amount;
    const out = [];
    for (const row of [...schedule].sort((a, b) => (a.due_date < b.due_date ? -1 : 1))) {
      if (remaining <= 0) break;
      const owed = row.installment_amount - row.paid_amount;
      if (owed <= 0) continue;
      const applied = Math.min(remaining, owed);
      remaining -= applied;
      out.push({ id: row.id, applied });
    }
    return { out, unapplied: remaining };
  };

  check("one instalment", allocate(rows, 50_000).out, [{ id: "s1", applied: 50_000 }]);
  check("two weeks of arrears clear oldest first", allocate(rows, 120_000).out, [
    { id: "s1", applied: 50_000 },
    { id: "s2", applied: 50_000 },
    { id: "s3", applied: 20_000 },
  ]);
  check("overpayment is reported, not absorbed", allocate(rows, 200_000).unapplied, 50_000);
  check("a receipt belongs to the oldest week it touched", allocate(rows, 120_000).out[0].id, "s1");
}

// 10. Paging arithmetic — the fix for the silent 1,000-row cap.
console.log("Paged reads");
{
  const PAGE = 1000;
  const pagesFor = (total) => {
    const windows = [];
    for (let from = 0; ; from += PAGE) {
      const got = Math.max(0, Math.min(PAGE, total - from));
      windows.push(got);
      if (got < PAGE) break;
    }
    return windows;
  };
  check(
    "2,600 rows read in full",
    pagesFor(2600).reduce((a, b) => a + b, 0),
    2600,
  );
  check("an exact multiple needs a final empty page", pagesFor(2000), [1000, 1000, 0]);
  check("a short table is one page", pagesFor(120), [120]);
  // 250 loans × 12 weeks is 3,000 rows — three times the cap, on a small branch.
  check(
    "250 loans of 12 weeks read in full",
    pagesFor(250 * 12).reduce((a, b) => a + b, 0),
    3000,
  );
}

// 11. The real modules.
//
// Everything above is a second implementation, which proves the rules are
// consistent but not that the shipped code follows them. Compile
// `src/lib/meetingDay.ts` and `src/lib/scheduleView.ts` and run the same cases
// through the actual functions. Output goes under `node_modules/.cache` so that
// `date-fns` resolves normally.
console.log("Shipped modules (src/lib/meetingDay.ts, src/lib/scheduleView.ts)");
// Held for section 13: the compiled output is deleted at the end of this
// section, but an imported module stays resolved in memory.
let approvalPersistenceModule = null;
{
  const { execFileSync } = await import("node:child_process");
  const { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");

  const root = path.resolve(import.meta.dirname, "..");
  const out = path.join(root, "node_modules", ".cache", "chetu-verify");
  const tsc = path.join(root, "node_modules", "typescript", "lib", "tsc.js");

  if (!existsSync(tsc)) {
    console.log("  SKIP  typescript is not installed — run `npm install` to include these checks");
  } else {
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    execFileSync(
      process.execPath,
      [
        tsc,
        path.join(root, "src/lib/meetingDay.ts"),
        path.join(root, "src/lib/scheduleView.ts"),
        path.join(root, "src/lib/fetchAll.ts"),
        path.join(root, "src/lib/approvalPersistence.ts"),
        "--outDir",
        out,
        "--module",
        "esnext",
        "--target",
        "es2022",
        "--moduleResolution",
        "bundler",
        "--skipLibCheck",
      ],
      { cwd: root, stdio: "inherit" },
    );

    // tsc emits extensionless relative specifiers; Node's ESM loader needs them.
    const sv = path.join(out, "lib", "scheduleView.js");
    writeFileSync(
      sv,
      readFileSync(sv, "utf8").replace(/from "\.\/meetingDay"/g, 'from "./meetingDay.js"'),
    );

    const md = await import(pathToFileURL(path.join(out, "lib", "meetingDay.js")).href);
    const sched = await import(pathToFileURL(sv).href);

    // The specification's Tuesday case, end to end.
    const tue = md.resolveFirstRepaymentDate("2026-09-22", "Tuesday", 7);
    check("shipped: first repayment", tue.firstDueDate, "2026-09-29");
    check("shipped: weekday", tue.weekday, "Tuesday");
    check("shipped: meeting day was used", tue.usedFallback, false);
    check("shipped: the run", md.weeklyDueDates(tue.firstDueDate, 7), [
      "2026-09-29",
      "2026-10-06",
      "2026-10-13",
      "2026-10-20",
      "2026-10-27",
      "2026-11-03",
      "2026-11-10",
    ]);
    check(
      "shipped: Friday group",
      md.resolveFirstRepaymentDate("2026-09-25", "Friday", 7).firstDueDate,
      "2026-10-02",
    );

    for (const day of WEEKDAYS) {
      const run = md.weeklyDueDates(
        md.resolveFirstRepaymentDate("2026-09-22", day, 7).firstDueDate,
        26,
      );
      assert(
        `shipped: ${day} holds for 26 weeks`,
        run.every((d) => weekdayOf(d) === day),
      );
    }
    assert(
      "shipped: December into January keeps the weekday",
      md.weeklyDueDates("2026-12-29", 4).every((d) => weekdayOf(d) === "Tuesday"),
    );
    assert(
      "shipped: a run across 29 February keeps the weekday",
      md.weeklyDueDates("2028-02-22", 3).every((d) => weekdayOf(d) === "Tuesday"),
    );

    // meeting_day is nullable free text in production: tolerate, then refuse.
    check("shipped: parses 'Tuesday'", md.parseMeetingDay("Tuesday"), 2);
    check("shipped: parses ' tuesday '", md.parseMeetingDay(" tuesday "), 2);
    check("shipped: parses 'TUE'", md.parseMeetingDay("TUE"), 2);
    check("shipped: parses 'Thur'", md.parseMeetingDay("Thur"), 4);
    check("shipped: refuses null", md.parseMeetingDay(null), null);
    check("shipped: refuses empty", md.parseMeetingDay(""), null);
    check("shipped: refuses ambiguous 'S'", md.parseMeetingDay("S"), null);
    check("shipped: refuses ambiguous 'T'", md.parseMeetingDay("T"), null);
    check("shipped: refuses 'Marketday'", md.parseMeetingDay("Marketday"), null);

    const fallback = md.resolveFirstRepaymentDate("2026-09-22", null, 7);
    assert("shipped: missing meeting day is flagged, not guessed", fallback.usedFallback === true);

    const drift = md.weekdayDrift(["2026-09-29", "2026-10-07", "2026-10-13"], "Tuesday");
    check("shipped: drift detected", drift.drifted, ["2026-10-07"]);

    // The worked example from the specification, through summariseSchedule.
    const rows = md.weeklyDueDates("2026-09-29", 4).map((due, i) => ({
      id: `s${i + 1}`,
      week_number: i + 1,
      due_date: due,
      installment_amount: 50_000,
      principal_portion: 43_500,
      interest_portion: 6_500,
      paid_amount: i === 0 ? 50_000 : 0,
      remaining_balance: 0,
      status: "Pending",
    }));
    const summary = sched.summariseSchedule(rows, "2026-10-13");
    check(
      "shipped: the example table",
      summary.installments.map((i) => i.status),
      ["Paid", "Overdue", "Due", "Pending"],
    );
    check(
      "shipped: the example balances",
      summary.installments.map((i) => i.balance),
      [0, 50_000, 50_000, 50_000],
    );
    check(
      "shipped: totals",
      [summary.totalExpected, summary.totalPaid, summary.totalOutstanding],
      [200_000, 50_000, 150_000],
    );
    check("shipped: arrears", [summary.arrearsCount, summary.arrearsAmount], [1, 50_000]);
    check("shipped: missed week keeps its date", summary.installments[1].dueDate, "2026-10-06");
    check("shipped: nothing is hidden", summary.expectedCount, 4);
    check("shipped: days in arrears", summary.daysInArrears, 7);

    const partial = rows.map((r) => ({ ...r }));
    partial[1].paid_amount = 30_000;
    const partialSummary = sched.summariseSchedule(partial, "2026-10-06");
    assert(
      "shipped: a part-paid instalment is not Paid",
      partialSummary.installments[1].status !== "Paid",
    );
    check(
      "shipped: part-payment leaves the remainder",
      partialSummary.installments[1].balance,
      20_000,
    );

    const fresh = md.weeklyDueDates("2026-09-29", 3).map((due, i) => ({
      id: `s${i + 1}`,
      week_number: i + 1,
      due_date: due,
      installment_amount: 50_000,
      principal_portion: 0,
      interest_portion: 0,
      paid_amount: 0,
      remaining_balance: 0,
      status: "Pending",
    }));
    const allocation = sched.allocatePayment(fresh, 120_000);
    check(
      "shipped: allocation order",
      allocation.allocations.map((a) => a.scheduleId),
      ["s1", "s2", "s3"],
    );
    check(
      "shipped: allocation amounts",
      allocation.allocations.map((a) => a.applied),
      [50_000, 50_000, 20_000],
    );
    check(
      "shipped: a receipt belongs to the oldest week it touched",
      allocation.allocations[0].scheduleId,
      "s1",
    );
    check("shipped: overpayment reported", sched.allocatePayment(fresh, 200_000).unapplied, 50_000);

    // A repaired schedule can hold a back-dated row after the later weeks.
    const outOfOrder = [
      {
        id: "later",
        week_number: 3,
        due_date: "2026-10-13",
        installment_amount: 50_000,
        principal_portion: 0,
        interest_portion: 0,
        paid_amount: 0,
        remaining_balance: 0,
        status: "Pending",
      },
      {
        id: "backdated",
        week_number: 1,
        due_date: "2026-09-29",
        installment_amount: 50_000,
        principal_portion: 0,
        interest_portion: 0,
        paid_amount: 0,
        remaining_balance: 0,
        status: "Pending",
      },
    ];
    check(
      "shipped: oldest due date settles first whatever the row order",
      sched.allocatePayment(outOfOrder, 50_000).allocations[0].scheduleId,
      "backdated",
    );

    // The paging helper, driven by a stub that behaves the way the Data API
    // does: it silently caps a response at 1,000 rows and reports no error.
    // This is the fix for "every loan loses its later weeks at the same
    // cut-off", so it is worth exercising against the real function.
    const { fetchAllRows, PAGE_SIZE } = await import(
      pathToFileURL(path.join(out, "lib", "fetchAll.js")).href
    );
    check("shipped: page size matches the Supabase default", PAGE_SIZE, 1000);

    const makeStub = (total) => {
      const calls = [];
      const build = () => ({
        range: (from, to) => {
          calls.push([from, to]);
          const rows = [];
          for (let i = from; i <= Math.min(to, total - 1); i += 1) rows.push({ id: i });
          return Promise.resolve({ data: rows, error: null });
        },
      });
      return { build, calls };
    };

    for (const total of [0, 1, 999, 1000, 1001, 2000, 3000, 12_345]) {
      const stub = makeStub(total);
      const { data, error } = await fetchAllRows(stub.build, "stub");
      check(`shipped: ${total} rows are all read`, data.length, total);
      check(`shipped: ${total} rows read without error`, error, null);
      assert(
        `shipped: ${total} rows read in order with no gaps`,
        data.every((row, i) => row.id === i),
      );
    }

    // 250 loans of 12 weeks is 3,000 schedule rows on a single small branch —
    // three times the cap that used to truncate every loan at once.
    const realistic = makeStub(250 * 12);
    const { data: allRows } = await fetchAllRows(realistic.build, "loan_repayment_schedule");
    check("shipped: 250 loans x 12 weeks read in full", allRows.length, 3000);
    check("shipped: that took four requests", realistic.calls.length, 4);

    // An error mid-way returns what was read plus the error, rather than
    // pretending the table is short.
    let call = 0;
    const failing = () => ({
      range: (from, to) => {
        call += 1;
        if (call === 2) return Promise.resolve({ data: null, error: { message: "boom" } });
        const rows = [];
        for (let i = from; i <= to; i += 1) rows.push({ id: i });
        return Promise.resolve({ data: rows, error: null });
      },
    });
    const failed = await fetchAllRows(failing, "stub");
    check("shipped: a failed page reports the error", failed.error?.message, "boom");
    check("shipped: a failed page keeps what was read", failed.data.length, 1000);

    approvalPersistenceModule = await import(
      pathToFileURL(path.join(out, "lib", "approvalPersistence.js")).href
    );

    rmSync(out, { recursive: true, force: true });
  }
}

// 12. The repair planner.
//
// `repair-schedules.mjs` exports `planForLoan`, which decides every change the
// repair would make. Driving it with synthetic loans proves what it does — and,
// more importantly, what it refuses to do — without a database.
console.log("Repair planner (scripts/repair-schedules.mjs)");
{
  const { planForLoan } = await import("./repair-schedules.mjs");

  const group = {
    id: "g1",
    group_code: "G-001",
    meeting_day: "Tuesday",
    meeting_frequency: "Weekly",
  };
  const client = { id: "c1", full_name: "Test Member", group_id: "g1" };
  const baseLoan = {
    id: "l1",
    loan_number: "CM-LN-TEST",
    client_id: "c1",
    status: "Active",
    disbursed_at: "2026-09-22T10:00:00Z",
    loan_period_weeks: 4,
    weekly_installment: 50_000,
    total_amount_payable: 200_000,
    outstanding_balance: 200_000,
  };
  const row = (week, due, paid = 0, status = "Pending") => ({
    id: `s${week}`,
    loan_id: "l1",
    week_number: week,
    due_date: due,
    installment_amount: 50_000,
    paid_amount: paid,
    remaining_balance: 50_000 - paid,
    status,
  });
  const kinds = (plan) => plan.actions.map((a) => a.kind);

  // A correct Tuesday loan needs nothing.
  const healthy = planForLoan({
    loan: baseLoan,
    client,
    group,
    rows: [row(1, "2026-09-29"), row(2, "2026-10-06"), row(3, "2026-10-13"), row(4, "2026-10-20")],
    receipts: [],
  });
  check("planner: a correct schedule is left alone", healthy.actions, []);

  // A missing week is created, unpaid, at its historical date.
  const missing = planForLoan({
    loan: baseLoan,
    client,
    group,
    rows: [row(1, "2026-09-29"), row(3, "2026-10-13"), row(4, "2026-10-20")],
    receipts: [],
  });
  const inserted = missing.actions.filter((a) => a.kind === "insert_installment");
  check("planner: one missing week is created", inserted.length, 1);
  check("planner: created at the right date", inserted[0].due, "2026-10-06");
  check("planner: created unpaid", inserted[0].row.paid_amount, 0);
  check("planner: created Pending, not Paid", inserted[0].row.status, "Pending");

  // Weekday drift on an UNPAID row is re-dated.
  const drifted = planForLoan({
    loan: baseLoan,
    client,
    group,
    rows: [row(1, "2026-09-29"), row(2, "2026-10-07"), row(3, "2026-10-14"), row(4, "2026-10-21")],
    receipts: [],
  });
  const redated = drifted.actions.filter((a) => a.kind === "redate_installment");
  check("planner: drifted unpaid rows are re-dated", redated.length, 3);
  check(
    "planner: re-dated onto the meeting day",
    redated.map((a) => a.due),
    ["2026-10-06", "2026-10-13", "2026-10-20"],
  );

  // Weekday drift on a PAID row is NOT re-dated. History stands.
  const driftedPaid = planForLoan({
    loan: baseLoan,
    client,
    group,
    rows: [
      row(1, "2026-09-29", 50_000, "Paid"),
      row(2, "2026-10-07", 50_000, "Paid"),
      row(3, "2026-10-13"),
      row(4, "2026-10-20"),
    ],
    receipts: [
      { id: "r1", receipt_number: "R1", amount_paid: 50_000, payment_date: "2026-09-29" },
      { id: "r2", receipt_number: "R2", amount_paid: 50_000, payment_date: "2026-10-07" },
    ],
  });
  assert(
    "planner: a paid instalment is never re-dated by the ordinary path",
    !driftedPaid.actions.some(
      (a) =>
        (a.kind === "redate_installment" || a.kind === "redate_paid_installment") && a.week === 2,
    ),
  );
  assert(
    "planner: refusing to re-date a paid row is reported",
    driftedPaid.skips.some((s) => s.includes("carries a payment")),
  );

  // The narrow guard for paid rows. It fires only when the member paid on the
  // date the rule says the instalment was due, and that date is earlier than
  // the one stored — the situation every drifted production week 1 is in.
  const guardFires = planForLoan({
    loan: { ...baseLoan, disbursed_at: "2026-09-11T10:00:00Z" },
    client,
    group: { ...group, meeting_day: "Thursday" },
    rows: [
      // Stored Friday 18th; the rule says Thursday 17th, which is when the
      // member paid.
      row(1, "2026-09-18", 50_000, "Paid"),
      row(2, "2026-09-25"),
      row(3, "2026-10-02"),
      row(4, "2026-10-09"),
    ],
    receipts: [{ id: "r1", receipt_number: "R1", amount_paid: 50_000, payment_date: "2026-09-17" }],
  });
  const guarded = guardFires.actions.find((a) => a.kind === "redate_paid_installment");
  assert("guard: fires when the receipt is dated on the corrected day", Boolean(guarded));
  check("guard: moves week 1 onto the paid date", guarded?.due, "2026-09-17");
  check("guard: moves it from the stored date", guarded?.from, "2026-09-18");
  assert(
    "guard: names the receipt it relied on",
    guarded?.receiptNumbers?.includes("R1"),
    JSON.stringify(guarded?.receiptNumbers),
  );
  assert(
    "guard: writes no amount, status or paid_at — only the date",
    guarded !== undefined &&
      !("amount" in guarded) &&
      !("status" in guarded) &&
      !("paid_amount" in guarded),
  );
  assert(
    "guard: touches no receipt",
    !guardFires.actions.some(
      (a) => a.kind !== "link_receipt" && String(a.kind).includes("receipt"),
    ),
  );

  // Refuses when no receipt falls on the corrected day.
  const guardNoReceipt = planForLoan({
    loan: { ...baseLoan, disbursed_at: "2026-09-11T10:00:00Z" },
    client,
    group: { ...group, meeting_day: "Thursday" },
    rows: [row(1, "2026-09-18", 50_000, "Paid"), row(2, "2026-09-25")],
    receipts: [{ id: "r1", receipt_number: "R1", amount_paid: 50_000, payment_date: "2026-09-20" }],
  });
  assert(
    "guard: refuses when no receipt is dated on the corrected day",
    !guardNoReceipt.actions.some((a) => a.kind === "redate_paid_installment"),
  );
  assert(
    "guard: says why it refused",
    guardNoReceipt.skips.some((s) => s.includes("no receipt is dated on the corrected day")),
  );

  // Refuses to push a paid instalment LATER, whatever the receipts say.
  const guardLater = planForLoan({
    loan: { ...baseLoan, disbursed_at: "2026-09-22T10:00:00Z" },
    client,
    group: { ...group, meeting_day: "Tuesday" },
    rows: [row(1, "2026-09-24", 50_000, "Paid"), row(2, "2026-10-06")],
    receipts: [{ id: "r1", receipt_number: "R1", amount_paid: 50_000, payment_date: "2026-09-29" }],
  });
  assert(
    "guard: never pushes a paid instalment into the future",
    !guardLater.actions.some((a) => a.kind === "redate_paid_installment"),
  );

  // Closed loans are never repaired.
  //
  // `settleLoan` writes the full instalment amount onto every remaining row
  // while its receipt carries only the settlement amount, so a settled loan
  // legitimately records more paid on the schedule than in receipts. Step 3 of
  // the planner would read that as an error and reopen instalments the
  // settlement closed. These fixtures are deliberately drifted AND
  // under-reconciled, so an unguarded planner would produce several actions.
  const closedRows = [
    row(1, "2026-09-30", 50_000, "Paid"),
    row(2, "2026-10-07", 50_000, "Paid"),
    row(3, "2026-10-14", 50_000, "Paid"),
    row(4, "2026-10-21", 50_000, "Paid"),
  ];
  const closedReceipts = [
    { id: "r1", receipt_number: "R1", amount_paid: 60_000, payment_date: "2026-09-29" },
  ];
  for (const status of ["Settled", "Fully Paid", "Written Off"]) {
    const closed = planForLoan({
      loan: { ...baseLoan, status },
      client,
      group,
      rows: closedRows,
      receipts: closedReceipts,
    });
    check(`closed: ${status} loan produces 0 repair actions`, closed.actions, []);
    assert(
      `closed: ${status} loan says why it was skipped`,
      closed.skips.some((s) => s.includes(status) && s.includes("closed loans are never repaired")),
      closed.skips.join(" | "),
    );
  }

  // The existing Pending behaviour is untouched.
  const pending = planForLoan({
    loan: { ...baseLoan, status: "Pending" },
    client,
    group,
    rows: closedRows,
    receipts: [],
  });
  check("closed: Pending loan still produces 0 actions", pending.actions, []);
  assert(
    "closed: Pending loan still reports 'not disbursed'",
    pending.skips.some((s) => s.includes("not disbursed")),
    pending.skips.join(" | "),
  );

  // Open statuses are unchanged: the same drifted fixture still plans work.
  for (const status of ["Active", "Partially Paid", "Overdue"]) {
    const open = planForLoan({
      loan: { ...baseLoan, status },
      client,
      group,
      rows: [
        row(1, "2026-09-30"),
        row(2, "2026-10-07"),
        row(3, "2026-10-14"),
        row(4, "2026-10-21"),
      ],
      receipts: [],
    });
    assert(
      `open: ${status} loan still plans repairs`,
      open.actions.length > 0,
      `actions: ${open.actions.length}`,
    );
    assert(
      `open: ${status} loan is not skipped as closed`,
      !open.skips.some((s) => s.includes("closed loans are never repaired")),
    );
  }

  // Reconciliation never invents money.
  const unreconciled = planForLoan({
    loan: baseLoan,
    client,
    group,
    rows: [row(1, "2026-09-29"), row(2, "2026-10-06"), row(3, "2026-10-13"), row(4, "2026-10-20")],
    receipts: [{ id: "r1", receipt_number: "R1", amount_paid: 50_000, payment_date: "2026-09-29" }],
  });
  const reconciled = unreconciled.actions.filter((a) => a.kind === "reconcile_installment");
  check("planner: only the paid week is reconciled", reconciled.length, 1);
  check("planner: reconciled to the receipt amount", reconciled[0].to.paid, 50_000);
  check("planner: reconciled week", reconciled[0].week, 1);
  check(
    "planner: never marks more paid than the receipts",
    reconciled.reduce((s, a) => s + a.to.paid, 0) <= 50_000,
    true,
  );

  // A partial receipt leaves the instalment partially paid.
  const partial = planForLoan({
    loan: baseLoan,
    client,
    group,
    rows: [row(1, "2026-09-29"), row(2, "2026-10-06"), row(3, "2026-10-13"), row(4, "2026-10-20")],
    receipts: [{ id: "r1", receipt_number: "R1", amount_paid: 30_000, payment_date: "2026-09-29" }],
  });
  const partialAction = partial.actions.find((a) => a.kind === "reconcile_installment");
  check("planner: partial stays partial", partialAction.to.status, "Partially Paid");
  check("planner: partial leaves the remainder", partialAction.to.balance, 20_000);

  // Receipts are linked to instalments, never created.
  const linked = unreconciled.actions.filter((a) => a.kind === "link_receipt");
  check("planner: the receipt is linked", linked.length, 1);
  check("planner: linked to the oldest week it paid", linked[0].week, 1);
  assert(
    "planner: never creates or edits a receipt",
    !unreconciled.actions.some((a) =>
      ["insert_receipt", "update_receipt", "delete_receipt", "delete"].includes(a.kind),
    ),
  );

  // Refusals. Each of these must stop the loan entirely.
  const refusals = [
    [
      "duplicate weeks",
      { rows: [row(1, "2026-09-29"), { ...row(1, "2026-09-30"), id: "dup" }] },
      "duplicate week",
    ],
    ["no group", { group: null }, "no group"],
    ["unusable meeting day", { group: { ...group, meeting_day: "Marketday" } }, "not a weekday"],
    ["empty meeting day", { group: { ...group, meeting_day: "" } }, "not a weekday"],
    ["null meeting day", { group: { ...group, meeting_day: null } }, "not a weekday"],
    ["monthly group", { group: { ...group, meeting_frequency: "Monthly" } }, "not Weekly"],
    ["no disbursement date", { loan: { ...baseLoan, disbursed_at: null } }, "disbursed_at"],
    ["undisbursed loan", { loan: { ...baseLoan, status: "Pending" } }, "not disbursed"],
    [
      "receipts exceed payable",
      {
        receipts: [
          { id: "r", receipt_number: "R", amount_paid: 900_000, payment_date: "2026-09-29" },
        ],
      },
      "exceed payable",
    ],
  ];
  for (const [label, override, expectedReason] of refusals) {
    const plan = planForLoan({
      loan: baseLoan,
      client,
      group,
      rows: [
        row(1, "2026-09-29"),
        row(2, "2026-10-06"),
        row(3, "2026-10-13"),
        row(4, "2026-10-20"),
      ],
      receipts: [],
      ...override,
    });
    check(`planner: refuses — ${label}`, plan.actions, []);
    assert(
      `planner: says why — ${label}`,
      plan.skips.some((s) => s.toLowerCase().includes(expectedReason.toLowerCase())),
      plan.skips.join(" | "),
    );
  }

  // A loan with no schedule at all gets a full one, entirely unpaid.
  const fromNothing = planForLoan({
    loan: baseLoan,
    client,
    group,
    rows: [],
    receipts: [],
  });
  check(
    "planner: rebuilds a missing schedule",
    kinds(fromNothing).filter((k) => k === "insert_installment").length,
    4,
  );
  assert(
    "planner: a rebuilt schedule is entirely unpaid",
    fromNothing.actions.every((a) => a.kind !== "insert_installment" || a.row.paid_amount === 0),
  );
  check("planner: rebuilt from the meeting day", fromNothing.actions[0].due, "2026-09-29");
  check(
    "planner: rebuilt dates are all Tuesdays",
    fromNothing.actions
      .filter((a) => a.kind === "insert_installment")
      .every((a) => weekdayOf(a.due) === "Tuesday"),
    true,
  );

  // A Friday group, to prove nothing is pinned to Tuesday.
  const friday = planForLoan({
    loan: { ...baseLoan, disbursed_at: "2026-09-25T10:00:00Z" },
    client,
    group: { ...group, meeting_day: "Friday" },
    rows: [],
    receipts: [],
  });
  check("planner: Friday group rebuild", friday.actions[0].due, "2026-10-02");
  check(
    "planner: Friday rebuild stays Friday",
    friday.actions.every((a) => weekdayOf(a.due) === "Friday"),
    true,
  );

  // Disbursement away from the meeting day — the case the two rules disagree
  // about, and the one every drifted production loan is in. A Thursday group
  // paid out on Friday 11 September 2026 starts at the next Thursday, the
  // 17th: the date its members actually paid on. The old seven-day rule said
  // the 24th. The checks above cannot see the difference because both their
  // loans are disbursed on their own meeting day, where the rules agree.
  const offMeetingDay = planForLoan({
    loan: { ...baseLoan, disbursed_at: "2026-09-11T10:00:00Z" },
    client,
    group: { ...group, meeting_day: "Thursday" },
    rows: [],
    receipts: [],
  });
  check(
    "planner: off-meeting-day rebuild takes the next meeting",
    offMeetingDay.actions[0].due,
    "2026-09-17",
  );
  assert(
    "planner: off-meeting-day rebuild does not add a spare week",
    offMeetingDay.actions[0].due !== "2026-09-24",
  );

  // grace_period_weeks is honoured when a product sets one, and 0 adds nothing.
  const withGrace = planForLoan({
    loan: { ...baseLoan, disbursed_at: "2026-09-11T10:00:00Z" },
    client,
    group: { ...group, meeting_day: "Thursday" },
    rows: [],
    receipts: [],
    product: { grace_period_weeks: 1 },
  });
  check("planner: grace_period_weeks = 1 adds a week", withGrace.actions[0].due, "2026-09-24");
  const zeroGrace = planForLoan({
    loan: { ...baseLoan, disbursed_at: "2026-09-11T10:00:00Z" },
    client,
    group: { ...group, meeting_day: "Thursday" },
    rows: [],
    receipts: [],
    product: { grace_period_weeks: 0 },
  });
  check("planner: grace_period_weeks = 0 adds nothing", zeroGrace.actions[0].due, "2026-09-17");

  // No plan, for any input above, may delete anything.
  const everyPlan = [
    healthy,
    missing,
    drifted,
    driftedPaid,
    unreconciled,
    partial,
    fromNothing,
    friday,
  ];
  assert(
    "planner: no plan ever deletes a row",
    everyPlan.every((p) => p.actions.every((a) => !/delete|remove|drop/i.test(a.kind))),
  );
  assert(
    "planner: no plan ever touches a loan's money",
    everyPlan.every((p) =>
      p.actions.every((a) => !/outstanding|principal|payable|interest|fee/i.test(a.kind)),
    ),
  );
}

// 13. Approval persistence: a loan and its schedule are written together, or
//     neither survives. `src/lib/approvalPersistence.ts` is dependency
//     injected, so every failure path runs here without a database.
console.log("Approval persistence (src/lib/approvalPersistence.ts)");
{
  if (!approvalPersistenceModule) {
    console.log("  SKIP  approvalPersistence.ts was not compiled — typescript is not installed");
  } else {
    const { persistApprovedLoan, ApprovalCompensationError } = approvalPersistenceModule;

    const loanRow = { id: "loan-1", loan_number: "CM-LN-TEST" };
    const ok = () => Promise.resolve({ error: null });
    const fail = (message) => () => Promise.resolve({ error: { message } });
    /** A delete that removed the row: PostgREST returns it when `.select()` is chained. */
    const deletedOne = () => Promise.resolve({ data: [loanRow], error: null });
    /**
     * A delete that matched nothing and still succeeded — what RLS does to a
     * Branch Manager, whose role fails the `loans` DELETE policy
     * `USING (private.is_admin())`. No error, no rows, orphan intact.
     */
    const deletedNone = () => Promise.resolve({ data: [], error: null });

    const spy = () => {
      const calls = [];
      return {
        calls,
        fn:
          (result) =>
          (...args) => (calls.push(args), result()),
      };
    };

    // 1. The happy path returns the loan and never compensates.
    {
      const del = spy();
      const restore = spy();
      const loan = await persistApprovedLoan({
        insertLoan: () => Promise.resolve({ data: loanRow, error: null }),
        insertSchedule: () => Promise.resolve({ error: null }),
        deleteLoan: del.fn(ok),
        restoreApplication: restore.fn(ok),
      });
      check("approval: returns the created loan", loan.loan_number, "CM-LN-TEST");
      check("approval: does not delete the loan on success", del.calls.length, 0);
      check("approval: does not restore the application on success", restore.calls.length, 0);
    }

    // 2-4. A schedule failure fails the approval, removes the orphan loan and
    //      restores the application. This is the Administrator path: the delete
    //      returns the row it removed.
    {
      const del = spy();
      const restore = spy();
      let thrown = null;
      try {
        await persistApprovedLoan({
          insertLoan: () => Promise.resolve({ data: loanRow, error: null }),
          insertSchedule: fail("schedule insert exploded"),
          deleteLoan: del.fn(deletedOne),
          restoreApplication: restore.fn(ok),
        });
      } catch (error) {
        thrown = error;
      }
      assert("approval: schedule failure throws", thrown !== null);
      assert(
        "approval: the error names the original cause",
        String(thrown?.message).includes("schedule insert exploded"),
        String(thrown?.message),
      );
      check("approval: the orphan loan is deleted", del.calls.length, 1);
      check("approval: the deleted loan is the one just created", del.calls[0]?.[0]?.id, "loan-1");
      check("approval: the application is restored", restore.calls.length, 1);
      assert(
        "approval: a clean rollback is not reported as a compensation failure",
        !(thrown instanceof ApprovalCompensationError),
      );
    }

    // 5. Compensation failure is explicit and never reports success.
    {
      let thrown = null;
      try {
        await persistApprovedLoan(
          {
            insertLoan: () => Promise.resolve({ data: loanRow, error: null }),
            insertSchedule: fail("schedule insert exploded"),
            deleteLoan: fail("delete refused"),
            restoreApplication: fail("restore refused"),
          },
          "CM-LA-TEST",
        );
      } catch (error) {
        thrown = error;
      }
      assert("approval: compensation failure throws", thrown !== null);
      assert(
        "approval: compensation failure is its own error type",
        thrown instanceof ApprovalCompensationError,
      );
      check("approval: reports the orphan loan remains", thrown?.orphanLoanRemains, true);
      check(
        "approval: reports the application still approved",
        thrown?.applicationStillApproved,
        true,
      );
      assert(
        "approval: warns the loan must not be disbursed",
        String(thrown?.message).includes("must not be disbursed"),
        String(thrown?.message),
      );
    }

    // A partial compensation — loan gone, application stuck — is still a failure.
    {
      let thrown = null;
      try {
        await persistApprovedLoan({
          insertLoan: () => Promise.resolve({ data: loanRow, error: null }),
          insertSchedule: fail("boom"),
          deleteLoan: deletedOne,
          restoreApplication: fail("restore refused"),
        });
      } catch (error) {
        thrown = error;
      }
      assert(
        "approval: partial compensation still fails",
        thrown instanceof ApprovalCompensationError,
      );
      check(
        "approval: partial compensation clears the orphan flag",
        thrown?.orphanLoanRemains,
        false,
      );
      check(
        "approval: partial compensation keeps the application flag",
        thrown?.applicationStillApproved,
        true,
      );
    }

    // BLOCKER-1. A delete that succeeds but removes nothing is a FAILED
    // compensation, not a clean rollback.
    //
    // This is the Branch Manager case: `loans` DELETE is
    // `USING (private.is_admin())` while approval admits Branch Managers, so
    // RLS filters the row out and PostgREST answers `{ data: [], error: null }`
    // — no error at all. Read as success, it told the approver the rollback had
    // worked while the scheduleless orphan sat in the disbursement queue.
    {
      const restore = spy();
      let thrown = null;
      try {
        await persistApprovedLoan(
          {
            insertLoan: () => Promise.resolve({ data: loanRow, error: null }),
            insertSchedule: fail("schedule insert exploded"),
            deleteLoan: deletedNone,
            restoreApplication: restore.fn(ok),
          },
          "CM-LA-TEST",
        );
      } catch (error) {
        thrown = error;
      }
      assert(
        "rls-delete: a zero-row delete is a compensation failure",
        thrown instanceof ApprovalCompensationError,
        `threw: ${thrown?.name}: ${thrown?.message}`,
      );
      check("rls-delete: the orphan is reported as remaining", thrown?.orphanLoanRemains, true);
      check(
        "rls-delete: the application restore is still recognised",
        thrown?.applicationStillApproved,
        false,
      );
      check("rls-delete: the surviving loan id is carried", thrown?.orphanLoanId, "loan-1");
      assert(
        "rls-delete: the error names the surviving loan id",
        String(thrown?.message).includes("loan-1"),
        String(thrown?.message),
      );
      assert(
        "rls-delete: the approver is NOT told the rollback succeeded",
        !String(thrown?.message).includes("has been rolled back"),
        String(thrown?.message),
      );
      assert(
        "rls-delete: the approver is told not to disburse it",
        String(thrown?.message).includes("must not be disbursed"),
      );
    }

    // A delete returning the row IS a successful compensation — the
    // Administrator path, kept beside the failing one so the two are compared.
    {
      let thrown = null;
      try {
        await persistApprovedLoan({
          insertLoan: () => Promise.resolve({ data: loanRow, error: null }),
          insertSchedule: fail("boom"),
          deleteLoan: deletedOne,
          restoreApplication: ok,
        });
      } catch (error) {
        thrown = error;
      }
      assert(
        "rls-delete: a row-returning delete is a clean rollback",
        !(thrown instanceof ApprovalCompensationError),
        `threw: ${thrown?.name}`,
      );
      assert(
        "rls-delete: a clean rollback says so",
        String(thrown?.message).includes("has been rolled back"),
        String(thrown?.message),
      );
    }

    // A delete that errors outright is also a failure — unchanged behaviour,
    // asserted here so the new data check did not replace the error check.
    {
      let thrown = null;
      try {
        await persistApprovedLoan({
          insertLoan: () => Promise.resolve({ data: loanRow, error: null }),
          insertSchedule: fail("boom"),
          deleteLoan: fail("delete refused"),
          restoreApplication: ok,
        });
      } catch (error) {
        thrown = error;
      }
      check(
        "rls-delete: an errored delete still reports the orphan",
        thrown?.orphanLoanRemains,
        true,
      );
    }

    // HIGH-1. A loan-insert failure checks the restore result instead of
    // ignoring it.
    {
      // Restore succeeds → the original loan-insert error is preserved intact.
      let thrown = null;
      try {
        await persistApprovedLoan({
          insertLoan: () => Promise.resolve({ data: null, error: { message: "loan insert died" } }),
          insertSchedule: ok,
          deleteLoan: deletedOne,
          restoreApplication: ok,
        });
      } catch (error) {
        thrown = error;
      }
      check(
        "restore-check: the original loan error is preserved",
        thrown?.message,
        "loan insert died",
      );
      assert(
        "restore-check: a successful restore adds no scare text",
        !String(thrown?.message).includes("could not be put back"),
        String(thrown?.message),
      );
    }
    {
      // Restore fails → both facts are reported, and the message never implies
      // the application was put back.
      let thrown = null;
      try {
        await persistApprovedLoan({
          insertLoan: () => Promise.resolve({ data: null, error: { message: "loan insert died" } }),
          insertSchedule: ok,
          deleteLoan: deletedOne,
          restoreApplication: fail("restore refused"),
        });
      } catch (error) {
        thrown = error;
      }
      assert(
        "restore-check: the original loan error survives a failed restore",
        String(thrown?.message).includes("loan insert died"),
        String(thrown?.message),
      );
      assert(
        "restore-check: a failed restore is stated explicitly",
        String(thrown?.message).includes("restore refused") &&
          String(thrown?.message).includes("could not be put back"),
        String(thrown?.message),
      );
      assert(
        "restore-check: it says the application is still Approved",
        String(thrown?.message).includes("still marked Approved"),
        String(thrown?.message),
      );
    }

    // The compensation delete as the application actually builds it.
    //
    // `persistApprovedLoan` is injected, so the stubs above prove how a result
    // is interpreted but not what query produced it. The guarantee depends on
    // both: `.select()` for the returned row, `.eq("id", …)` for the loan just
    // created, `.eq("status", "Pending")` so a loan whose state moved on is
    // never removed. Asserted against the source, which is the only place this
    // is visible without a database.
    {
      const { readFileSync } = await import("node:fs");
      const path = await import("node:path");
      const source = readFileSync(
        path.join(path.resolve(import.meta.dirname, ".."), "src/context/DatabaseContext.tsx"),
        "utf8",
      );
      const deleteCall = source.slice(
        source.indexOf("deleteLoan:"),
        source.indexOf("restoreApplication:"),
      );
      assert(
        "delete query: targets the newly created loan by id",
        /\.eq\(\s*"id",\s*loan\.id\s*\)/.test(deleteCall),
        deleteCall.trim(),
      );
      assert(
        "delete query: requires the loan to still be Pending",
        /\.eq\(\s*"status",\s*"Pending"\s*\)/.test(deleteCall),
        deleteCall.trim(),
      );
      assert(
        "delete query: returns the deleted row via .select()",
        /\.select\(\)/.test(deleteCall),
        deleteCall.trim(),
      );
    }

    // 6. A loan insert rejected by the database — which is how the UNIQUE
    //    application_id blocks a second approval — never reaches the schedule
    //    and never deletes anything.
    {
      const del = spy();
      const sched = spy();
      let thrown = null;
      try {
        await persistApprovedLoan({
          insertLoan: () =>
            Promise.resolve({
              data: null,
              error: {
                message:
                  'duplicate key value violates unique constraint "loans_application_id_key"',
              },
            }),
          insertSchedule: sched.fn(ok),
          deleteLoan: del.fn(ok),
          restoreApplication: ok,
        });
      } catch (error) {
        thrown = error;
      }
      assert("approval: a rejected loan insert throws", thrown !== null);
      assert(
        "approval: the unique-constraint message survives",
        String(thrown?.message).includes("loans_application_id_key"),
        String(thrown?.message),
      );
      check("approval: no schedule is attempted without a loan", sched.calls.length, 0);
      check("approval: nothing is deleted when no loan was created", del.calls.length, 0);
    }
  }
}

// ---------------------------------------------------------------------- result

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${checks} checks FAILED\n`);
  process.exit(1);
}
console.log(`All ${checks} checks passed.\n`);
