import { Profile, SystemSettings, UserRole } from '../types/database.types';

export const defaultSettings: SystemSettings = {
  id: 1,
  company_name: 'Chetu Microfinance Ltd',
  company_logo_url: '/logo.svg',
  default_currency: 'UGX',
  branches: [],
  default_interest_rate: 15.0,
  default_processing_fee: 2.0,
  receipt_footer: 'Thank you for choosing Chetu Microfinance Ltd. Prompt repayments build a strong credit standing.',
  report_header: 'Chetu Microfinance Ltd - Official Financial Operations Report'
};

// The functions below back a local-only login/setup flow that is used
// exclusively when no Supabase project is configured (local development
// without VITE_SUPABASE_* env vars). They are never used once a real
// Supabase project is connected.
export const getInitialUsers = (): Profile[] => {
  try {
    const saved = localStorage.getItem('chetu_db_users');
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore parse errors
  }
  return [];
};

export const saveUsers = (users: Profile[]): void => {
  localStorage.setItem('chetu_db_users', JSON.stringify(users));
};
