import React, { useMemo, useState } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from '../../lib/router-compat';
import {
  AlertTriangle,
  Banknote,
  Bell,
  CheckCheck,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Settings2,
  X,
} from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Each notification type gets one icon and one accent — no rainbow. */
const TYPE_STYLE: Record<string, { icon: React.ElementType; ring: string; text: string }> = {
  Application:  { icon: FileSpreadsheet, ring: 'bg-[#0B4394]/10', text: 'text-[#0B4394]' },
  Disbursement: { icon: Banknote,        ring: 'bg-emerald-50',   text: 'text-emerald-700' },
  Repayment:    { icon: Banknote,        ring: 'bg-emerald-50',   text: 'text-emerald-700' },
  Overdue:      { icon: Clock,           ring: 'bg-amber-50',     text: 'text-amber-700' },
  Alert:        { icon: AlertTriangle,   ring: 'bg-red-50',       text: 'text-chetu-red' },
  System:       { icon: Settings2,       ring: 'bg-slate-100',    text: 'text-slate-600' },
};

/** "just now", "14 min ago", "3 h ago", then the calendar date. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

const dayBucket = (iso: string): string => {
  const d = new Date(iso);
  const today = new Date();
  const yday = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
};

/**
 * Notification drawer.
 *
 * Every entry is actionable: tapping it marks it read and navigates to the
 * screen where the work is done. Entries are grouped by day and ordered newest
 * first, so the unread band at the top is what needs attention now.
 */
export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose }) => {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const grouped = useMemo(() => {
    const list = showUnreadOnly ? notifications.filter((n) => !n.is_read) : notifications;
    const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const out: { day: string; items: typeof sorted }[] = [];
    for (const item of sorted) {
      const day = dayBucket(item.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(item);
      else out.push({ day, items: [item] });
    }
    return out;
  }, [notifications, showUnreadOnly]);

  if (!isOpen) return null;

  const open = (item: (typeof notifications)[number]) => {
    if (!item.is_read) markAsRead(item.id);
    if (item.link_url) {
      navigate(item.link_url);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Notifications"
      >
        <header className="shrink-0 border-b border-slate-200 bg-[#0B4394] px-4 py-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Bell className="h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Notifications</h2>
                <p className="text-[11px] text-blue-200">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'You are up to date'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="shrink-0 rounded p-1.5 text-blue-100 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUnreadOnly(false)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold ${!showUnreadOnly ? 'bg-white text-[#0B4394]' : 'bg-white/10 text-blue-100 hover:bg-white/20'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setShowUnreadOnly(true)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold ${showUnreadOnly ? 'bg-white text-[#0B4394]' : 'bg-white/10 text-blue-100 hover:bg-white/20'}`}
            >
              Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="ml-auto inline-flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-blue-100 hover:bg-white/20 hover:text-white"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 min-h-0 scroll-area scroll-y">
          {grouped.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Bell className="mx-auto mb-3 h-9 w-9 text-slate-200" />
              <p className="text-sm font-semibold text-slate-600">
                {showUnreadOnly ? 'Nothing unread' : 'No notifications yet'}
              </p>
              <p className="mt-1 text-[13px] text-slate-400">
                {showUnreadOnly
                  ? 'Everything here has been read.'
                  : 'Approvals, disbursements and collections will appear here as they happen.'}
              </p>
            </div>
          ) : (
            grouped.map(({ day, items }) => (
              <section key={day}>
                <h3 className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {day}
                </h3>
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const style = TYPE_STYLE[item.type] || TYPE_STYLE.System!;
                    const Icon = style.icon;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => open(item)}
                          className={`flex w-full items-start gap-3 py-3 pr-4 text-left transition-colors ${
                            item.is_read
                              ? 'bg-white pl-4 hover:bg-slate-50'
                              : // Unread reads as a distinct state, not a tint a
                                // tired eye has to hunt for: tinted row, solid
                                // accent rail and darker copy.
                                'border-l-4 border-[#0B4394] bg-blue-50/70 pl-3 hover:bg-blue-100/70'
                          }`}
                        >
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded ${style.ring} ${style.text}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                {!item.is_read && (
                                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#0B4394]" />
                                )}
                                <span
                                  className={`min-w-0 truncate text-[13px] ${
                                    item.is_read ? 'font-semibold text-slate-600' : 'font-black text-slate-900'
                                  }`}
                                >
                                  {item.title}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 text-[11px] ${
                                  item.is_read ? 'text-slate-400' : 'font-bold text-[#0B4394]'
                                }`}
                              >
                                {relativeTime(item.created_at)}
                              </span>
                            </span>
                            <span
                              className={`mt-0.5 block text-[12px] leading-relaxed ${
                                item.is_read ? 'text-slate-500' : 'text-slate-700'
                              }`}
                            >
                              {item.message}
                            </span>
                            {!item.is_read && <span className="sr-only">Unread</span>}
                          </span>
                          {item.link_url && <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <p className="text-[11px] text-slate-500">Tap a notification to go to the screen where it can be actioned.</p>
        </footer>
      </aside>
    </div>
  );
};
