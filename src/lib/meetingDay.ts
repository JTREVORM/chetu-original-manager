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
 * The first occurrence of `weekdayIndex` that is at least `minDaysAhead` days
 * after `from`.
 *
 * With `minDaysAhead = 7` (one week's grace, the rule the system has always
 * applied) a Tuesday group disbursed on Tuesday 22 September 2026 gets Tuesday
 * the 29th — never the same day, and never a first instalment only two days
 * after the cash was handed over.
 */
export function nextMeetingDay(
  from: string | Date,
  weekdayIndex: number,
  minDaysAhead: number = 7,
): Date {
  const start = parseLocalDate(from);
  const earliest = addDays(start, Math.max(0, minDaysAhead));
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
 * meeting at least `graceDays` away. When it does not, the schedule falls back
 * to the anchor's own weekday, which is the behaviour the system had before
 * meeting days were honoured at all; `usedFallback` says which of the two
 * happened so callers can report it instead of quietly accepting it.
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
  graceDays: number = 7,
): FirstRepaymentResolution {
  const anchor = parseLocalDate(anchorDate);
  const parsed = parseMeetingDay(meetingDay);
  const weekdayIndex = parsed ?? addDays(anchor, graceDays).getDay();
  const due = nextMeetingDay(anchor, weekdayIndex, graceDays);

  return {
    firstDueDate: toISODate(due),
    weekdayIndex,
    weekday: WEEKDAY_NAMES[weekdayIndex],
    usedFallback: parsed === null,
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
