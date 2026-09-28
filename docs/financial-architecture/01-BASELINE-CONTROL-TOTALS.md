# Baseline financial control totals

**Source:** Supabase project `xfkuptxrrnzumzmulblg` ("CHETU MICROFINANCE"), read-only, **2026-09-28**.
**Purpose:** the "before" side of the reconciliation. Every figure here must still be reproducible,
to the shilling, after the financial-architecture migration. Re-run `baseline-controls.sql` to
regenerate them.

Nothing in this document was changed in production. All figures are **derived by query**, not read
from any stored total, except where a row explicitly says otherwise.

## A. Scale of the production dataset

This is early-production data, not years of history. That materially lowers migration risk.

| Table | Rows |
| --- | ---: |
| branches | 1 (`BR-001` Buyende) |
| profiles (staff) | 3 |
| clients | 25 |
| client_groups | 5 |
| loans | 16 (15 disbursed, 1 Pending) |
| loan_repayment_schedule | 263 |
| loan_repayments | 26 |
| member_fees | 24 |
| **bank_transactions** | **2** |
| **expenses** | **0** |
| savings_accounts | 25 (all zero balance) |
| savings_transactions | 0 |
| loan_reversals | 0 |
| loan_security_returns | 0 |
| transfers | 0 |
| business_days | 14 |
| audit_logs | 240 |

## B. Liquidity as the system currently reports it

| Measure | Amount (UGX) | How it is produced |
| --- | ---: | --- |
| Current Bank Balance (Bank Management + Dashboard tile) | **2,090,000** | `Σ deposits − Σ withdrawals` over RLS-visible `bank_transactions` |
| Total Deposits | 2,090,000 | 2 rows, both `Capital Equity Injection` |
| Total Withdrawals | **0** | no withdrawal row has ever been written |
| Cash at Hand | **not represented** | no column, table or concept |
| Mobile Money / Merchant | **not represented** | no column, table or concept |
| Total available liquidity | **not computable** | the system has exactly one undifferentiated money pool |
| "Bank Liquidity Balance" on the *Institutional Financial Statement* report | **252,090,000** | `Reports.tsx` seeds the reduce with a hard-coded `250000000` — see audit §2.4 |

The two ledger rows in full:

| # | Date | Type | Category | Description | Amount | `balance_after` |
| --- | --- | --- | --- | --- | ---: | ---: |
| CM-TX-2026-0001 | 2026-09-07 | Deposit | Capital Equity Injection | "Cash Deposit" | 2,000,000 | 2,000,000 |
| CM-TX-2026-0002 | 2026-09-07 | Deposit | Capital Equity Injection | "Cash at hand" | 90,000 | 2,090,000 |

Both are stamped to branch Buyende and to business day `fcf1f285…`. Note that CM-TX-2026-0002 is
described by the operator as *cash at hand* but is stored as a bank deposit, because the schema
offers nowhere else to put it. This is the only evidence in production of a cash-versus-bank
distinction, and it is in a free-text field.

## C. Capital and funding

| Measure | Amount (UGX) |
| --- | ---: |
| Total capital introduced | **2,090,000** |
| Capital withdrawals / drawings | 0 |
| Destination account recorded | **none** (no account dimension exists) |

## D. Loan book — money with borrowers

All 15 disbursed loans are one product at 20% flat over 16 weeks (one at 23 weeks).

| Measure | Amount (UGX) |
| --- | ---: |
| Loans disbursed (count) | 15 |
| Gross principal disbursed | **6,600,000** |
| Processing fees charged (4%) | 264,000 |
| CRB fees charged (1%) | 66,000 |
| Group maintenance fees charged | 30,000 |
| **Total loan fees charged** | **360,000** |
| Refundable security withheld (15%) | **990,000** |
| **Net cash handed to members** | **5,250,000** |
| Contracted interest | 1,320,000 |
| Total amount payable | 7,920,000 |
| Undisbursed approved loan (CM-LN-2026-0016) | 500,000 principal |

Identity check: `6,600,000 − 360,000 − 990,000 = 5,250,000` ✔ (matches `Σ net_disbursed_amount`).

## E. Collections

| Measure | Amount (UGX) |
| --- | ---: |
| Receipts issued | 26 |
| **Total collected** | **851,100** |
| — principal portion | **708,200** |
| — interest portion | **142,900** |
| — penalties | 0 (no penalty concept exists) |
| — fees collected inside a repayment | 0 |
| Security collected via repayments | 0 |
| Payment method | 100% `Cash` |

The principal/interest split is **derived** by pro-rating each instalment's `paid_amount` across its
`principal_portion` / `interest_portion`. It is not stored anywhere today. Identity checks:
`708,200 + 142,900 = 851,100` ✔.

## F. Outstanding book

| Measure | Amount (UGX) |
| --- | ---: |
| Open loans (Active / Partially Paid / Overdue) | 15 |
| **Outstanding principal** | **5,891,800** |
| **Interest receivable** | **1,177,100** |
| **Total outstanding (as `loans.outstanding_balance`)** | **7,068,900** |
| Penalties receivable | 0 (not represented) |
| Refundable security held (liability to members) | **990,000** |
| Active borrowers | 15 |

Identity checks:
- `5,891,800 + 708,200 = 6,600,000` (principal) ✔
- `1,177,100 + 142,900 = 1,320,000` (interest) ✔
- `7,068,900 + 851,100 = 7,920,000` (total payable) ✔

**Stored-vs-derived agreement:** for all 16 loans,
`loans.outstanding_balance = total_amount_payable − Σ schedule.paid_amount` **exactly**, and
`Σ principal_portion` / `Σ interest_portion` equal `principal_amount` / `total_interest_amount`
exactly. There is **no drift** between the stored totals and the schedule. This is the single most
important fact for migration safety: the schedule can be trusted as the arithmetic source of truth.

## G. Arrears and portfolio at risk

| Bucket | Loans | Overdue amount (UGX) |
| --- | ---: | ---: |
| Current | 15 | — |
| PAR 1–7 | 0 | 0 |
| PAR 8–30 | 0 | 0 |
| PAR 31–60 | 0 | 0 |
| PAR 61–90 | 0 | 0 |
| PAR 90+ | 0 | 0 |
| **Total arrears** | **0** | **0** |

Every instalment falling due on or before 2026-09-28 is fully paid. Overdue principal = 0,
PAR30 = 0, PAR30 ratio = 0.00%. Maximum days past due = 0.

## H. Income and expenses

| Measure | Amount (UGX) |
| --- | ---: |
| Interest collected (income earned, cash basis) | 142,900 |
| Loan fees charged at approval (processing + CRB + group maintenance) | 360,000 |
| Member admission fees collected | 120,000 |
| Member passbook fees collected | 120,000 |
| Member CRB fees collected at admission | 0 |
| **Total member fees collected (24 members, 100% Cash)** | **240,000** |
| Penalty income | 0 |
| **Total operating expenses** | **0** (table empty) |

## I. Totals by branch

Single branch, so branch totals equal institution totals:

| Branch | Members | Loans | Outstanding | Bank ledger | Arrears |
| --- | ---: | ---: | ---: | ---: | ---: |
| BR-001 Buyende | 25 | 16 | 7,068,900 | 2,090,000 | 0 |

## J. Totals by financial account

**Not available.** No account dimension exists in production. Establishing one is the point of this
programme; see the audit's historical-limitation section for what can and cannot be reconstructed.

## K. The control identity that does not hold

Cash actually paid out (5,250,000 net to members) exceeds all capital ever recorded (2,090,000) by
**3,160,000**, and the ledger shows liquidity **unchanged at 2,090,000** despite it. The ledger is
therefore not a record of Chetu's real cash position and must not be treated as an opening balance
without a physical count. The cause is diagnosed in the audit (§1) — it is a silent RLS rejection,
not a data-entry omission.
