/**
 * Paged reads against the Supabase Data API.
 *
 * Supabase caps a PostgREST response at the project's "Max rows" setting —
 * 1,000 by default. A capped response is **not** an error: it arrives with
 * `error: null` and simply holds fewer rows than exist, so the caller cannot
 * tell a short table from a truncated one.
 *
 * `loan_repayment_schedule` was read as a single unpaginated
 * `select("*").order("week_number")`. Once the table passed the cap, the rows
 * that came back were every loan's week 1, then every loan's week 2, and so on
 * until the budget ran out — so **every loan in the system lost its later weeks
 * at the same cut-off**, and each schedule stopped part way through its cycle.
 * That is the "next week's repayment never appears" report, and it got worse
 * with every loan approved. Raising the project's Max rows setting would only
 * move the cliff; paging removes it.
 */

/** Rows per request. Matches the Supabase default so a page is never rejected. */
export const PAGE_SIZE = 1000;

/** The shape of a Supabase query builder once the filters are applied. */
export interface RangeableQuery {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

/**
 * Reads an entire table, a page at a time.
 *
 * `build` is called once per page rather than reused, because a Supabase query
 * builder cannot be re-ranged after it has been awaited. Give it a total
 * ordering — add `.order("id")` after any other sort — or two rows tying on the
 * sort key can be returned twice, or skipped, as the window moves.
 *
 * On failure the rows read so far are returned along with the error: a partial
 * portfolio still beats a blank screen, and the caller logs it.
 */
export async function fetchAllRows<T>(
  build: () => RangeableQuery,
  label: string,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`Failed to page through ${label}`, error);
      return { data: all, error };
    }
    const page = (data || []) as T[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: all, error: null };
}
