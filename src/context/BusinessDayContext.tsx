import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type BusinessDayStatus = 'NOT_OPENED' | 'OPEN' | 'CLOSED' | 'APPROVED' | 'LOCKED';
export type OfficerDayStatus =
  | 'LOCKED' | 'ACTIVE' | 'SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SPECIAL_ACCESS';

export interface BusinessDayRow {
  id: string;
  branch_id: string;
  business_date: string;
  status: BusinessDayStatus;
  opened_by?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  approved_at?: string | null;
  notes?: string | null;
}

export interface OfficerDayRow {
  id: string;
  business_day_id: string;
  officer_id: string;
  branch_id: string;
  business_date: string;
  status: OfficerDayStatus;
  started_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  summary?: Record<string, number> | null;
}

export interface AccessRequestRow {
  id: string;
  requester_id: string;
  branch_id?: string | null;
  business_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
  decided_by?: string | null;
  decided_at?: string | null;
  decision_reason?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

interface WorkingState {
  can_transact: boolean;
  reason: string;
  business_day_status: BusinessDayStatus;
  officer_day_status: OfficerDayStatus;
  is_weekend: boolean;
  business_date: string;
}

export interface AuditRow {
  id: number;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  branch_id?: string | null;
  business_date?: string | null;
  subject_id?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  reason?: string | null;
  created_at: string;
}

interface BusinessDayContextType {
  /** Server time, ticking locally from a measured offset. */
  now: Date;
  serverDate: string;
  isWeekend: boolean;
  loading: boolean;
  /** The authoritative answer to "may I write?", from the database. */
  canTransact: boolean;
  lockReason: string;
  businessDayStatus: BusinessDayStatus;
  officerDayStatus: OfficerDayStatus;
  businessDays: BusinessDayRow[];
  officerDays: OfficerDayRow[];
  accessRequests: AccessRequestRow[];
  audit: AuditRow[];
  /** Staff id -> display name, so control screens can name people not just ids. */
  staffNames: Record<string, string>;
  /** Full staff rows, for counting the officers a branch actually has. */
  staff: StaffRow[];
  refresh: () => Promise<void>;
}

export interface StaffRow {
  id: string;
  full_name: string;
  role: string;
  branch_ids: string[] | null;
  status: string;
}

const BusinessDayContext = createContext<BusinessDayContextType | undefined>(undefined);

const FALLBACK: WorkingState = {
  can_transact: true,
  reason: '',
  business_day_status: 'NOT_OPENED',
  officer_day_status: 'LOCKED',
  is_weekend: false,
  business_date: new Date().toISOString().split('T')[0]!,
};

export const BusinessDayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [state, setState] = useState<WorkingState>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [businessDays, setBusinessDays] = useState<BusinessDayRow[]>([]);
  const [officerDays, setOfficerDays] = useState<OfficerDayRow[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);

  /**
   * Difference between the database clock and this device's, measured once per
   * refresh. The visible clock then ticks locally against that offset, so a
   * user who sets their laptop to Friday still sees Saturday — §14 requires the
   * date never to come from the device.
   */
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !user?.id) {
      setLoading(false);
      return;
    }
    try {
      // Sweep lapsed approvals before reading the state, so a window that has
      // run out is already reflected in what comes back.
      await supabase.rpc('expire_access_requests').then(
        () => undefined,
        () => undefined,
      );

      const [timeRes, stateRes, daysRes, officerRes, accessRes, auditRes, staffRes] = await Promise.all([
        supabase.rpc('server_time'),
        supabase.rpc('my_working_state'),
        supabase.from('business_days').select('*').order('business_date', { ascending: false }).limit(60),
        supabase.from('officer_days').select('*').order('business_date', { ascending: false }).limit(200),
        supabase.from('access_requests').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('business_day_audit').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id, full_name, role, branch_ids, status'),
      ]);

      const t = Array.isArray(timeRes.data) ? timeRes.data[0] : timeRes.data;
      if (t?.server_now) {
        offsetRef.current = new Date(t.server_now).getTime() - Date.now();
        setNow(new Date(Date.now() + offsetRef.current));
      }

      const s = Array.isArray(stateRes.data) ? stateRes.data[0] : stateRes.data;
      if (s) setState(s as WorkingState);

      setBusinessDays((daysRes.data || []) as BusinessDayRow[]);
      setOfficerDays((officerRes.data || []) as OfficerDayRow[]);
      setAccessRequests((accessRes.data || []) as AccessRequestRow[]);
      setAudit((auditRes.data || []) as AuditRow[]);
      setStaff((staffRes.data || []) as StaffRow[]);
    } catch {
      /* a control-plane hiccup must not blank the screen */
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tick the visible clock from the measured offset, never from Date.now alone.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date(Date.now() + offsetRef.current)), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Re-check the gate periodically and whenever the control tables change, so a
  // manager opening the day unlocks the officer's screen without a reload.
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return;
    const channel = supabase
      .channel('business-day-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_days' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'officer_days' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, () => refresh())
      .subscribe();
    const poll = window.setInterval(refresh, 60000);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [user?.id, refresh]);

  const value = useMemo<BusinessDayContextType>(
    () => ({
      now,
      serverDate: state.business_date,
      isWeekend: state.is_weekend,
      loading,
      canTransact: state.can_transact,
      lockReason: state.reason,
      businessDayStatus: state.business_day_status,
      officerDayStatus: state.officer_day_status,
      businessDays,
      officerDays,
      accessRequests,
      audit,
      staffNames: Object.fromEntries(staff.map((p) => [p.id, p.full_name])),
      staff,
      refresh,
    }),
    [now, state, loading, businessDays, officerDays, accessRequests, audit, staff, refresh],
  );

  return <BusinessDayContext.Provider value={value}>{children}</BusinessDayContext.Provider>;
};

export const useBusinessDayControl = () => {
  const ctx = useContext(BusinessDayContext);
  if (!ctx) throw new Error('useBusinessDayControl must be used within BusinessDayProvider');
  return ctx;
};
