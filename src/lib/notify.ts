import { supabase, isSupabaseConfigured } from './supabase';

export type NotifyType = 'Application' | 'Repayment' | 'Overdue' | 'Disbursement' | 'Alert' | 'System';

export type NotifyAudience = 'admins' | 'managers' | 'all-staff';

interface NotifyInput {
  title: string;
  message: string;
  type: NotifyType;
  link_url?: string;
  /** Roles that should receive the alert. */
  audience?: NotifyAudience;
  /** Extra specific profile ids (e.g. the officer who submitted). */
  recipientIds?: string[];
  /** Never notify the person who triggered the action. */
  excludeId?: string;
}

const rolesFor = (audience: NotifyAudience): string[] => {
  if (audience === 'admins') return ['Administrator'];
  if (audience === 'managers') return ['Administrator', 'Branch Manager'];
  return ['Administrator', 'Branch Manager', 'Loan Officer', 'Auditor'];
};

/**
 * Fan a notification out to staff. Failures are swallowed on purpose — an alert
 * that cannot be written must never break the business transaction that raised it.
 */
export const sendNotification = async (input: NotifyInput): Promise<void> => {
  if (!isSupabaseConfigured) return;
  try {
    const ids = new Set<string>(input.recipientIds || []);

    if (input.audience) {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .in('role', rolesFor(input.audience))
        .eq('status', 'Active');
      (data || []).forEach((p: { id: string }) => ids.add(p.id));
    }

    if (input.excludeId) ids.delete(input.excludeId);
    if (ids.size === 0) return;

    const stamp = Date.now();
    const rows = Array.from(ids).map((recipient_id, i) => ({
      id: `NT-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      recipient_id,
      title: input.title,
      message: input.message,
      type: input.type,
      is_read: false,
      link_url: input.link_url || null,
    }));

    await supabase.from('notifications').insert(rows);
  } catch (err) {
    console.warn('Notification delivery skipped', err);
  }
};
