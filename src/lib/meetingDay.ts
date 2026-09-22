/**
 * Weekly repayment dates follow the group's meeting weekday.
 *
 * A member in a Tuesday group repays on Tuesdays — the 29th of September, the
 * 6th of October, the 13th — and the schedule keeps landing on Tuesday when the
 * month rolls over, when February is short, and when the year changes. Nothing
 * here reasons in months: a week is seven days, and seven days added to a
 * Tuesday is always a Tuesday.
 *
 * Before this module the loan path never read `client_groups.meeting_day` at
 * all. `approveLoanApplication` anchored the whole schedule to `new Date()` —
 * the moment the manager clicked Approve — so a Tuesday group whose loan was
 * approved on a Thursday repaid on Thursdays for its entire cycle.
 */
import { addDays, format } from "date-fns";

/** The seven weekday names as `client_groups.meeting_day` stores them. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

/** `Date.getDay()` index for each weekday name, 0 = Sunday. */
const WEEKDAY_INDEX: Record<string, number> = Object.fromEntries(
  WEEKDAY_NAMES.map((name, i) => [name.toLowerCase(), i]),
);

/**
 * Reads a stored `meeting_day` and returns its weekday index, or `null` when
 * the value is missing or is not a weekday name.
 *
 * `client_groups.meeting_day` is nullable free text with no CHECK constraint,
 * so production can hold `NULL`, `""`, `"Tues"`, `"TUESDAY"` or something that
 * is not a day at all. Tolerate case and surrounding space, accept the common
 * three-letter abbreviations, and refuse anything else rather than guessing —
 * a wrong guess here silently re-dates a borrower's whole schedule.
 */
export function parseMeetingDay(meetingDay?: string | null): number | null {
  if (!meetingDay) return null;
  const cleaned = meetingDay.trim().toLowerCase();
  if (!cleaned) return null;

  if (cleaned in WEEKDAY_INDEX) return WEEKDAY_INDEX[cleaned];

  // "Tue" / "Tues" / "Thur" — a prefix is only accepted when it can mean one
  // weekday and no other. "S" and "T" are ambiguous and are refused.
  const matches = WEEKDAY_NAMES.filter((name) => name.toLowerCase().startsWith(cleaned));
  return matches.length === 1 ? WEEKDAY_INDEX[matches[0].toLowerCase()] : null;
}

/** The canonical spelling of a stored meeting day, or `null` if unrecognised. */
export function normaliseMeetingDay(meetingDay?: string | null): WeekdayName | null {
  const index = parseMeetingDay(meetingDay);
  return index === null ? null : WEEKDAY_NAMES[index];
}

/**
 * Parses a `yyyy-MM-dd` date string, or a Date, into a local-midnight Date.
 *
 * `new Date("2026-09-22")` is parsed as UTC midnight, which in any timezone
 * behind UTC is the 21st locally — so a Tuesday due date formats back as
 * Monday. Every date in this system is a calendar day with no time-of-day
 * meaning, so split the string and build it in local time instead.
 */
export function parseLocalDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(input);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Formats a date as the `yyyy-MM-dd` string the database stores. */
export const toISODate = (input: string | Date): string =>
  format(parseLocalDate(input), "yyyy-MM-dd");

/**
 * Minimum days between disbursement and instalment #1 under the approved rule:
 * the first group meeting *strictly after* the money went out.
 *
 * One, not seven. A same-day instalment is never the first one — `nextMeetingDay`
 * starts counting from the day after disbursement — but no extra full week is
 * inserted either.
 */
export const DEFAULT_GRACE_DAYS = 1;

/**
 * How many days a given `grace_period_weeks` holds repayment back.
 *
 * `loan_products.grace_period_weeks` is the number of *extra* whole weeks
 * before collection starts. Zero — the value Chetu's live product carries —
 * means none: repayment begins at the next meeting. Each further week adds
 * seven days, and the floor of one keeps a same-day first instalment
 * impossible at any setting.
 *
 * This is the single place the column is turned into days. Before this the
 * column was read by no calculation at all and a flat seven days was assumed
 * everywhere, which pushed every off-meeting-day loan a week past the meeting
 * its members were already paying at.
 */
export function graceDaysFor(graceWeeks: number | null | undefined): number {
  const weeks = Math.floor(Number(graceWeeks ?? 0));
  return Math.max(DEFAULT_GRACE_DAYS, (Number.isFinite(weeks) ? Math.max(0, weeks) : 0) * 7);
}

/**
 * The first occurrence of `weekdayIndex` that is at least `minDaysAhead` days
 * after `from`.
 *
 * With the default `minDaysAhead = 1` a Thursday group disbursed on Friday
 * 11 September 2026 gets Thursday the 17th — the next meeting, which is where
 * its members actually paid — and a Tuesday group disbursed on Tuesday the
 * 22nd gets Tuesday the 29th, never the same day.
 */
export function nextMeetingDay(
  from: string | Date,
  weekdayIndex: number,
  minDaysAhead: number = DEFAULT_GRACE_DAYS,
): Date {
  const start = parseLocalDate(from);
  // Floored at one day, not zero: instalment #1 can never fall on the
  // disbursement date itself, whatever a caller passes.
  const earliest = addDays(start, Math.max(DEFAULT_GRACE_DAYS, minDaysAhead));
  // How many days from `earliest` forward to the wanted weekday, 0 if it
  // already is that weekday. Adding 7 before the modulo keeps it non-negative.
  const shift = (weekdayIndex - earliest.getDay() + 7) % 7;
  return addDays(earliest, shift);
}

/**
 * The `count` weekly due dates for a loan, as `yyyy-MM-dd` strings.
 *
 * Each date is seven days after the one before it, so they all share a weekday
 * and the run crosses months and years without drifting.
 */
export function weeklyDueDates(firstDueDate: string | Date, count: number): string[] {
  const first = parseLocalDate(firstDueDate);
  return Array.from({ length: Math.max(0, count) }, (_, i) => toISODate(addDays(first, i * 7)));
}

/**
 * Where a loan's first repayment falls.
 *
 * `anchorDate` is the business event the schedule hangs off — the disbursement
 * date once cash has gone out, the approval date while the loan is still in the
 * disbursement queue.
 *
 * When the group has a usable meeting day the first repayment is the first such
 * meeting at least `graceDays` away — by default the very next one. When it
 * does not, the schedule falls back to the anchor's own weekday a full week
 * out, which is the behaviour the system had before meeting days were honoured
 * at all; `usedFallback` says which of the two happened so callers can report
 * it instead of quietly accepting it.
 *
 * The fallback deliberately keeps its seven days. With no meeting day there is
 * no meeting to bring the date forward to, and putting instalment #1 one day
 * after disbursement because the group's day is unreadable would be worse than
 * the week the system has always given.
 */
export interface FirstRepaymentResolution {
  firstDueDate: string;
  weekdayIndex: number;
  weekday: WeekdayName;
  usedFallback: boolean;
}

export function resolveFirstRepaymentDate(
  anchorDate: string | Date,
  meetingDay: string | null | undefined,
  graceDays: number = DEFAULT_GRACE_DAYS,
): FirstRepaymentResolution {
  const anchor = parseLocalDate(anchorDate);
  const parsed = parseMeetingDay(meetingDay);

  if (parsed === null) {
    const due = addDays(anchor, 7);
    return {
      firstDueDate: toISODate(due),
      weekdayIndex: due.getDay(),
      weekday: WEEKDAY_NAMES[due.getDay()],
      usedFallback: true,
    };
  }

  const due = nextMeetingDay(anchor, parsed, graceDays);
  return {
    firstDueDate: toISODate(due),
    weekdayIndex: parsed,
    weekday: WEEKDAY_NAMES[parsed],
    usedFallback: false,
  };
}

/** True when every date in `dueDates` falls on the same weekday. */
export function allSameWeekday(dueDates: string[]): boolean {
  if (dueDates.length < 2) return true;
  const first = parseLocalDate(dueDates[0]).getDay();
  return dueDates.every((d) => parseLocalDate(d).getDay() === first);
}

/**
 * Due dates in a schedule that do not fall on the group's meeting weekday.
 *
 * Used by the audit to measure drift without changing anything.
 */
export function weekdayDrift(
  dueDates: string[],
  meetingDay: string | null | undefined,
): { expectedWeekday: WeekdayName | null; drifted: string[] } {
  const index = parseMeetingDay(meetingDay);
  if (index === null) return { expectedWeekday: null, drifted: [] };
  return {
    expectedWeekday: WEEKDAY_NAMES[index],
    drifted: dueDates.filter((d) => parseLocalDate(d).getDay() !== index),
  };
}
