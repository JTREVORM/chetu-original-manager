/**
 * Removes exactly what `seed-demo.mjs` created, using the manifest it wrote.
 * Records added through the application afterwards are left alone.
 *
 *   node scripts/clear-demo.mjs
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MANIFEST = resolve(HERE, 'demo-manifest.json');

if (!existsSync(MANIFEST)) {
  console.error('No demo-manifest.json found — nothing to remove.');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const made = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const some = (a) => (a && a.length ? a : ['__none__']);

// Children first, so foreign keys never block the delete.
await svc.from('notifications').delete().in('id', some(made.notifications));
await svc.from('transfers').delete().in('id', some(made.transfers));
await svc.from('loan_reversals').delete().in('loan_id', some(made.loans));
await svc.from('loan_repayments').delete().in('loan_id', some(made.loans));
await svc.from('loan_repayment_schedule').delete().in('loan_id', some(made.loans));
await svc.from('loan_security_returns').delete().in('loan_id', some(made.loans));
await svc.from('bad_loan_comments').delete().in('loan_id', some(made.loans));
await svc.from('loans').delete().in('id', some(made.loans));
await svc.from('loan_applications').delete().in('id', some(made.apps));

const { data: accounts } = await svc.from('savings_accounts').select('id').in('client_id', some(made.clients));
const accountIds = (accounts ?? []).map((a) => a.id);
await svc.from('savings_transactions').delete().in('account_id', some(accountIds));
await svc.from('savings_accounts').delete().in('client_id', some(made.clients));

await svc.from('member_fees').delete().in('client_id', some(made.clients));
await svc.from('group_members').delete().in('client_id', some(made.clients));
await svc.from('clients').delete().in('id', some(made.clients));
await svc.from('group_attendance').delete().in('group_id', some(made.groups));
await svc.from('client_groups').delete().in('id', some(made.groups));
await svc.from('loan_products').delete().in('id', some(made.products));

// Ledger rows are matched by the branches they were booked against.
await svc.from('expenses').delete().in('branch_id', some(made.branches));
await svc.from('bank_transactions').delete().in('branch_id', some(made.branches));
await svc.from('branches').delete().in('id', some(made.branches));

for (const id of made.users ?? []) {
  await svc.from('audit_logs').delete().eq('user_id', id);
  await svc.auth.admin.deleteUser(id);
}

unlinkSync(MANIFEST);

const count = async (t) => (await svc.from(t).select('*', { count: 'exact', head: true })).count;
console.log(`
Demo data removed.

  branches ${await count('branches')}   groups ${await count('client_groups')}   members ${await count('clients')}
  loans ${await count('loans')}   applications ${await count('loan_applications')}   products ${await count('loan_products')}
  staff profiles remaining: ${await count('profiles')}
`);
