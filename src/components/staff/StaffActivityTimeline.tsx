/**
 * What a staff member actually did, and what was done to their account.
 *
 * Both come from records the system already keeps rather than a second log
 * written for this screen: `audit_logs` for the work (every registration,
 * application, receipt and approval files one) and `business_day_audit` for
 * the day boundaries a Loan Officer's work sits inside. Nothing here is
 * synthesised — if an action left no record, it does not appear.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, FileClock, History, RefreshCw } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { EmptyState, shortDate, shortTime } from "./StaffUi";

export interface ActivityEntry {
  id: string;
  at: string;
  action: string;
  detail: string;
  /** 'work' is something they did; 'account' is something done to them. */
  kind: "work" | "account" | "day";
  actor?: string | null;
  previous?: string | null;
  next?: string | null;
  reason?: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  module: string;
  details: string;
  created_at: string;
  user_name: string;
  previous_value?: string | null;
  new_value?: string | null;
  reason?: string | null;
}

interface DayAuditRow {
  id: number;
  action: string;
  business_date: string | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  actor_name: string | null;
  created_at: string;
}

/**
 * Reads both trails for one person. `mode` decides which question is being
 * asked: what they have been doing, or what has been done to their account.
 */
export function useStaffActivity(staffId: string | null, mode: "activity" | "audit") {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffId || !isSupabaseConfigured) return;
    setLoading(true);
    setError(null);

    if (mode === "audit") {
      // Entries *about* this account: who changed what, from what, to what.
      const { data, error: readError } = await supabase
        .from("audit_logs")
        .select(
          "id, action, module, details, created_at, user_name, previous_value, new_value, reason",
        )
        .eq("target_user_id", staffId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (readError) {
        setError(readError.message);
        setLoading(false);
        return;
      }
      setEntries(
        ((data || []) as AuditRow[]).map((row) => ({
          id: row.id,
          at: row.created_at,
          action: row.action,
          detail: row.details,
          kind: "account" as const,
          actor: row.user_name,
          previous: row.previous_value ?? null,
          next: row.new_value ?? null,
          reason: row.reason ?? null,
        })),
      );
      setLoading(false);
      return;
    }

    // Entries *by* this person, plus the day boundaries their work sat inside.
    const [work, days] = await Promise.all([
      supabase
        .from("audit_logs")
        .select(
          "id, action, module, details, created_at, user_name, previous_value, new_value, reason",
        )
        .eq("user_id", staffId)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("business_day_audit")
        .select(
          "id, action, business_date, previous_status, new_status, reason, actor_name, created_at",
        )
        .eq("subject_id", staffId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (work.error) {
      setError(work.error.message);
      setLoading(false);
      return;
    }

    const merged: ActivityEntry[] = [
      ...((work.data || []) as AuditRow[]).map((row) => ({
        id: `w-${row.id}`,
        at: row.created_at,
        action: row.action,
        detail: row.details,
        kind: "work" as const,
        actor: row.user_name,
      })),
      // The day trail may be unreadable to some roles; that is a narrower
      // answer, not a failure, so it is simply left out.
      ...((days.data || []) as DayAuditRow[]).map((row) => ({
        id: `d-${row.id}`,
        at: row.created_at,
        action: row.action,
        detail: row.business_date ? `Business day ${shortDate(row.business_date)}` : "",
        kind: "day" as const,
        actor: row.actor_name,
        previous: row.previous_status,
        next: row.new_status,
        reason: row.reason,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    setEntries(merged);
    setLoading(false);
  }, [staffId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, loading, error, reload: load };
}

/** Today / Yesterday / the date — the heading a reader scans for. */
const dayHeading = (iso: string) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diff = Math.floor((startOfToday.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return shortDate(iso);
};

const KIND_DOT: Record<ActivityEntry["kind"], string> = {
  work: "bg-[#0B4394]",
  account: "bg-amber-500",
  day: "bg-emerald-500",
};

export const StaffActivityTimeline: React.FC<{
  staffId: string | null;
  mode: "activity" | "audit";
  staffName: string;
}> = ({ staffId, mode, staffName }) => {
  const { entries, loading, error, reload } = useStaffActivity(staffId, mode);

  const grouped = useMemo(() => {
    const buckets: { heading: string; items: ActivityEntry[] }[] = [];
    entries.forEach((entry) => {
      const heading = dayHeading(entry.at);
      const last = buckets[buckets.length - 1];
      if (last && last.heading === heading) last.items.push(entry);
      else buckets.push({ heading, items: [entry] });
    });
    return buckets;
  }, [entries]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex animate-pulse gap-3 px-1 py-2">
            <div className="h-2 w-2 shrink-0 translate-y-1.5 rounded-full bg-slate-200" />
            <div className="flex-1">
              <div className="h-2.5 w-1/3 rounded bg-slate-200" />
              <div className="mt-2 h-2 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
        <p className="text-[12px] font-bold text-red-800">Unable to load this history.</p>
        <p className="mt-0.5 text-[11px] text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-800 hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={mode === "audit" ? FileClock : History}
        title={mode === "audit" ? "No account changes recorded" : "No recorded activity yet"}
        message={
          mode === "audit"
            ? `Nothing has been changed on ${staffName}'s account since the trail began.`
            : `${staffName} has not filed any work the system keeps a record of.`
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map((bucket) => (
        <div key={bucket.heading}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <CalendarClock className="h-3 w-3" />
            {bucket.heading}
          </p>
          <ol className="relative space-y-2 border-l border-slate-200 pl-4">
            {bucket.items.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-white ${KIND_DOT[entry.kind]}`}
                />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[11px] font-bold tabular-nums text-slate-400">
                    {shortTime(entry.at)}
                  </span>
                  <span className="text-[12px] font-bold text-slate-900">{entry.action}</span>
                </div>
                {entry.detail && (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">
                    {entry.detail}
                  </p>
                )}
                {(entry.previous || entry.next) && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {entry.previous ? (
                      <span className="line-through decoration-slate-300">{entry.previous}</span>
                    ) : (
                      <span className="text-slate-400">not set</span>
                    )}
                    <span className="mx-1.5 text-slate-300">→</span>
                    <span className="font-semibold text-slate-700">{entry.next || "not set"}</span>
                  </p>
                )}
                {entry.reason && (
                  <p className="mt-0.5 rounded bg-slate-50 px-2 py-1 text-[11px] italic leading-relaxed text-slate-600">
                    “{entry.reason}”
                  </p>
                )}
                {mode === "audit" && entry.actor && (
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    Performed by {entry.actor}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
};
