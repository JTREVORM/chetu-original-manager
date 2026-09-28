-- Chetu financial control totals — READ ONLY.
-- Run before the migration and again after it. Every row must match.
-- Executed against the Supabase Management API / SQL editor.
--   POST https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_ID}/database/query

with disbursed as (
  select * from loans where disbursed_at is not null
),
open_loans as (
  select * from loans where status in ('Active','Partially Paid','Overdue')
),
sched as (
  select s.*,
    case when s.installment_amount > 0
         then s.paid_amount * s.principal_portion / s.installment_amount else 0 end as prin_paid,
    case when s.installment_amount > 0
         then s.paid_amount * s.interest_portion  / s.installment_amount else 0 end as int_paid
  from loan_repayment_schedule s
  join disbursed l on l.id = s.loan_id
),
arrears as (
  select o.id,
    coalesce(sum(greatest(0, s.installment_amount - s.paid_amount))
             filter (where s.due_date <= current_date), 0) as overdue_amt,
    min(s.due_date) filter (
      where s.due_date <= current_date and s.installment_amount - s.paid_amount > 0
    ) as oldest_unpaid
  from open_loans o
  left join loan_repayment_schedule s on s.loan_id = o.id
  group by o.id
)
select 'capital_introduced'        as control, (select coalesce(sum(amount),0) from bank_transactions where transaction_type='Deposit'  and category ilike '%capital%') as value
union all select 'bank_ledger_deposits',        (select coalesce(sum(amount),0) from bank_transactions where transaction_type='Deposit')
union all select 'bank_ledger_withdrawals',     (select coalesce(sum(amount),0) from bank_transactions where transaction_type='Withdrawal')
union all select 'bank_ledger_balance',         (select coalesce(sum(case when transaction_type='Deposit' then amount else -amount end),0) from bank_transactions)
union all select 'loans_disbursed_count',       (select count(*) from disbursed)
union all select 'principal_disbursed',         (select coalesce(sum(principal_amount),0) from disbursed)
union all select 'net_cash_to_members',         (select coalesce(sum(net_disbursed_amount),0) from disbursed)
union all select 'loan_fees_charged',           (select coalesce(sum(processing_fee_amount+crb_fee_amount+group_maintenance_fee),0) from disbursed)
union all select 'security_withheld',           (select coalesce(sum(security_amount),0) from disbursed)
union all select 'contracted_interest',         (select coalesce(sum(total_interest_amount),0) from disbursed)
union all select 'total_amount_payable',        (select coalesce(sum(total_amount_payable),0) from disbursed)
union all select 'total_collected',             (select coalesce(sum(amount_paid),0) from loan_repayments)
union all select 'principal_collected',         (select round(coalesce(sum(prin_paid),0),2) from sched)
union all select 'interest_collected',          (select round(coalesce(sum(int_paid),0),2)  from sched)
union all select 'principal_outstanding',       (select round(coalesce(sum(principal_portion)-sum(prin_paid),0),2) from sched)
union all select 'interest_outstanding',        (select round(coalesce(sum(interest_portion)-sum(int_paid),0),2)  from sched)
union all select 'outstanding_stored',          (select coalesce(sum(outstanding_balance),0) from open_loans)
union all select 'outstanding_derived',         (select round(coalesce(sum(installment_amount)-sum(paid_amount),0),2) from sched)
union all select 'security_liability',          (select coalesce(sum(security_balance),0) from disbursed where status not in ('Settled','Written Off'))
union all select 'total_arrears',               (select coalesce(sum(overdue_amt),0) from arrears)
union all select 'loans_in_arrears',            (select count(*) from arrears where overdue_amt > 0)
union all select 'par30_value',                 (select coalesce(sum(o.outstanding_balance),0) from arrears a join open_loans o on o.id=a.id where a.oldest_unpaid is not null and current_date - a.oldest_unpaid > 30)
union all select 'member_fees_collected',       (select coalesce(sum(total_amount),0) from member_fees)
union all select 'total_expenses',              (select coalesce(sum(amount),0) from expenses)
union all select 'savings_balance',             (select coalesce(sum(balance),0) from savings_accounts)
union all select 'active_borrowers',            (select count(distinct client_id) from open_loans)
order by control;

-- Integrity assertions. Every row must return zero.
select 'stored_vs_derived_outstanding_drift' as assertion, count(*) as failures
from loans l
left join (
  select loan_id, sum(paid_amount) paid, sum(installment_amount) due
  from loan_repayment_schedule group by loan_id
) s on s.loan_id = l.id
where l.status <> 'Written Off'
  and abs(coalesce(l.total_amount_payable,0) - coalesce(s.paid,0) - coalesce(l.outstanding_balance,0)) > 0.01
union all
select 'schedule_portions_vs_loan_totals', count(*)
from loans l
join (
  select loan_id, sum(principal_portion) p, sum(interest_portion) i
  from loan_repayment_schedule group by loan_id
) s on s.loan_id = l.id
where abs(s.p - l.principal_amount) > 0.01 or abs(s.i - l.total_interest_amount) > 0.01
union all
select 'repayments_vs_schedule_paid', count(*)
from (
  select (select coalesce(sum(amount_paid),0) from loan_repayments) r,
         (select coalesce(sum(paid_amount),0)  from loan_repayment_schedule) s
) t where abs(t.r - t.s) > 0.01
union all
select 'fee_identity_net_disbursed', count(*)
from loans
where disbursed_at is not null
  and abs(principal_amount - processing_fee_amount - crb_fee_amount
          - group_maintenance_fee - security_amount - coalesce(net_disbursed_amount,0)) > 0.01;
