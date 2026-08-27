import React, { useEffect, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  markPushPromptAnswered,
  pushPromptAnswered,
  pushSupported,
  requestPushPermission,
} from '../../lib/pushNotifications';

/**
 * Asks permission to send alerts to this device.
 *
 * The browser's own permission dialog can only be raised from a click, and a
 * dialog that appears unexplained tends to get dismissed for good — so this
 * card explains what the alerts are for first, and only then triggers it.
 *
 * Shown once per device: answering either way records the fact.
 */
export const NotificationPermissionPrompt: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id || !pushSupported()) return;
    // 'denied' is the browser's decision to keep; re-asking cannot override it.
    if (Notification.permission !== 'default' || pushPromptAnswered()) return;
    // A beat after sign-in, so it does not collide with the page settling.
    const t = window.setTimeout(() => setVisible(true), 4000);
    return () => window.clearTimeout(t);
  }, [user?.id]);

  if (!visible) return null;

  const close = () => {
    markPushPromptAnswered();
    setVisible(false);
  };

  const allow = async () => {
    setBusy(true);
    try {
      const result = await requestPushPermission();
      if (result === 'granted') {
        addToast('success', 'Alerts on', 'This device will now be notified as things happen.');
      } else if (result === 'denied') {
        addToast(
          'info',
          'Alerts blocked',
          'You can turn them on later from your browser’s site settings.',
        );
      }
    } finally {
      setBusy(false);
      setVisible(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:bottom-4 sm:left-auto sm:right-4 sm:p-0">
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="brand-gradient flex items-start gap-3 px-4 py-3.5 text-white">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Get alerts on this device</h2>
            <p className="mt-0.5 text-[12px] leading-snug text-blue-50">
              Approvals, disbursements, collections and account changes, the moment they happen.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Not now"
            className="shrink-0 rounded p-1 text-blue-100 hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={allow}
            disabled={busy}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 text-[13px] font-bold text-white transition-colors hover:bg-amber-400 disabled:opacity-70"
          >
            <Bell className="h-4 w-4" />
            {busy ? 'Waiting…' : 'Allow alerts'}
          </button>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <BellOff className="h-4 w-4" />
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};
