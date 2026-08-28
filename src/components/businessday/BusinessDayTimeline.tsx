import React from 'react';
import type { TimelineEvent } from '../../lib/businessDayStats';

const time = (v: string) => new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const DOT: Record<TimelineEvent['tone'], string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-chetu-red',
  slate: 'bg-slate-400',
};

/**
 * The day's lifecycle in order. A manager reviewing what happened should not
 * have to open the audit log to answer "when did the officers finish?".
 */
export const BusinessDayTimeline: React.FC<{ events: TimelineEvent[] }> = ({ events }) => {
  if (events.length === 0) {
    return <p className="px-5 py-6 text-center text-[12px] text-slate-400">Nothing has happened on this day yet.</p>;
  }

  return (
    <ol className="relative space-y-4 px-5 py-4">
      {/* One continuous rule behind the dots, rather than a border per item. */}
      <span aria-hidden className="absolute bottom-4 left-[26px] top-6 w-px bg-slate-200" />
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative flex gap-3">
          <span className="z-10 mt-0.5 flex w-14 shrink-0 justify-end">
            <span className="text-[11px] font-bold tabular-nums text-slate-500">{time(e.at)}</span>
          </span>
          <span className={`z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white ${DOT[e.tone]}`} />
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-slate-900">{e.label}</span>
            {e.detail && <span className="block text-[12px] text-slate-600">{e.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
};
