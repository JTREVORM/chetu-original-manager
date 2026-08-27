import React from 'react';
import { Bell } from 'lucide-react';

/**
 * The notification bell, shared by the desktop and mobile header bars so the
 * two can never drift apart.
 *
 * With nothing unread it is a quiet slate icon. With unread items the whole
 * control turns red — tinted background, red bell, and a counted badge that
 * sits clear of the glyph rather than on top of it — because a single muted
 * dot over a grey icon is easy to walk past on a busy screen.
 */
export const NotificationBell: React.FC<{
  count: number;
  onClick: () => void;
  /** `lg` is the roomier mobile icon bar; `md` the compact desktop header. */
  size?: 'md' | 'lg';
}> = ({ count, onClick, size = 'md' }) => {
  const unread = count > 0;
  // Beyond 99 the exact number stops mattering and the badge stops fitting.
  const label = count > 99 ? '99+' : String(count);

  const icon = size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  const pad = size === 'lg' ? 'p-1.5' : 'p-2';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unread ? `Notifications — ${count} unread` : 'Notifications'}
      title={unread ? `${count} unread notification${count === 1 ? '' : 's'}` : 'Notifications'}
      className={`relative shrink-0 rounded-xl transition-colors ${pad} ${
        unread
          ? 'bg-red-50 text-chetu-red ring-1 ring-red-200 hover:bg-red-100'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <Bell className={`${icon} ${unread ? 'text-chetu-red' : ''}`} strokeWidth={unread ? 2.5 : 2} />

      {unread && (
        <>
          {/*
            The halo pulses, the badge does not: animating the badge itself
            (as `animate-pulse` did) fades the number to half opacity on every
            cycle, which makes the count harder to read, not easier.
          */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 h-[18px] w-[18px] rounded-full bg-chetu-red/60 motion-safe:animate-ping"
          />
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-chetu-red px-1 text-[10px] font-black leading-none text-white tabular-nums ring-2 ring-white"
          >
            {label}
          </span>
        </>
      )}
    </button>
  );
};
