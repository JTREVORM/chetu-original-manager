/**
 * The Financial Ledger.
 *
 * Replaces Bank Management, which showed a single unnamed "bank balance" that
 * no disbursement, collection or fee had ever touched. Seven tabs over one
 * balanced ledger: Accounts & Cash, Transactions, Capital & Funding, Income,
 * Expenses, Reconciliation and Reports.
 *
 * Every figure on this page is derived from posted journals. Nothing here
 * reads a stored balance, because there is no longer a stored balance to read.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Building2,
  CheckCircle2,
  FileText,
  Landmark,
  Plus,
  RefreshCw,
  Scale,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useDatabase } from "../../context/DatabaseContext";
import { useNotifications } from "../../context/NotificationContext";
import { MisModal, MisTable, money, shortDate } from "../../components/mis/MisKit";
import { AccountSelect } from "../../components/financial/AccountSelect";
import { createAccount } from "../../lib/financial/ledger";
import {
  AccountLedgerModal,
  CapitalModal,
  NewAccountModal,
  ReconcileModal,
  ReverseModal,
  TransferModal,
} from "./LedgerModals";
import {
  buildProfitAndLoss,
  fetchAccountLedger,
  fetchIncomeStatement,
  fetchReconciliations,
  fetchTransactions,
} from "../../lib/financial/reports";
import { formatUGX } from "../../lib/loanCalculations";
import type {
  AccountBalance,
  AccountLedgerRow,
  AccountReconciliationRow,
  FinancialAccountType,
  FinancialTransactionRow,
  IncomeStatementRow,
} from "../../types/database.types";

type Tab =
  "accounts" | "transactions" | "capital" | "income" | "expenses" | "reconciliation" | "reports";

const TABS: { key: Tab; label: string }[] = [
  { key: "accounts", label: "Accounts & Cash" },
  { key: "transactions", label: "Transactions" },
  { key: "capital", label: "Capital & Funding" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "reconciliation", label: "Reconciliation" },
  { key: "reports", label: "Reports" },
];

const TYPE_LABELS: Record<FinancialAccountType, string> = {
  cash_at_hand: "Cash at Hand",
  cashier_till: "Cashier Till",
  branch_cash: "Branch Cash",
  bank: "Bank Account",
  mobile_money: "Mobile Money",
  merchant: "Merchant Account",
  loans_receivable: "Loans Receivable",
  interest_receivable: "Interest Receivable",
  penalty_receivable: "Penalties Receivable",
  security_held: "Security Held",
  capital: "Capital",
  income: "Income",
  expense: "Expense",
  writeoff: "Write-off",
  suspense: "Suspense",
  other: "Other",
};

const ENTRY_LABELS: Record<string, string> = {
  capital_injection: "Capital in",
  capital_withdrawal: "Capital out",
  disbursement: "Disbursement",
  repayment: "Repayment",
  fee_collection: "Fees",
  expense: "Expense",
  internal_transfer: "Transfer",
  security_refund: "Security refund",
  writeoff: "Write-off",
  other_income: "Other income",
  reconciliation_adjustment: "Reconciliation",
  opening_balance: "Opening balance",
  legacy_backfill: "Legacy",
  reversal: "Reversal",
};

const iconFor = (type: FinancialAccountType) =>
  type === "bank" ? Landmark : type === "mobile_money" || type === "merchant" ? Smartphone : Wallet;

export const FinancialLedger: React.FC = () => {
  const { isAdmin, isAuditor, user } = useAuth();
  const {
    accountBalances,
    moneyPosition,
    ledgerHealth,
    refreshFinancials,
    branches,
    recordCapital,
    recordInternalTransfer,
    reverseFinancialTransaction,
    reconcileAccount,
  } = useDatabase();
  const { addToast } = useNotifications();

  const [tab, setTab] = useState<Tab>("accounts");
  const [busy, setBusy] = useState(false);

  const [transactions, setTransactions] = useState<FinancialTransactionRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeStatementRow[]>([]);
  const [reconciliations, setReconciliations] = useState<AccountReconciliationRow[]>([]);
  const [ledgerFor, setLedgerFor] = useState<AccountBalance | null>(null);
  const [ledgerRows, setLedgerRows] = useState<AccountLedgerRow[]>([]);

  const [capitalOpen, setCapitalOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [reconcileFor, setReconcileFor] = useState<AccountBalance | null>(null);
  const [reverseFor, setReverseFor] = useState<FinancialTransactionRow | null>(null);

  const canPost = !isAuditor;

  const liquid = useMemo(
    () => accountBalances.filter((a) => a.account_class === "asset_liquid"),
    [accountBalances],
  );
  const legacy = useMemo(() => liquid.find((a) => a.is_legacy), [liquid]);
  const realAccounts = useMemo(() => liquid.filter((a) => !a.is_legacy), [liquid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tx, inc, rec] = await Promise.all([
          fetchTransactions(),
          fetchIncomeStatement(),
          fetchReconciliations(),
        ]);
        if (cancelled) return;
        setTransactions(tx);
        setIncomeRows(inc);
        setReconciliations(rec);
      } catch (error) {
        if (!cancelled) {
          addToast(
            "error",
            "Could not load the ledger",
            error instanceof Error ? error.message : "Please try again.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountBalances.length]);

  const openAccountLedger = async (account: AccountBalance) => {
    setLedgerFor(account);
    try {
      setLedgerRows(await fetchAccountLedger(account.account_id));
    } catch (error) {
      addToast(
        "error",
        "Could not open the account ledger",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const reload = async () => {
    setBusy(true);
    try {
      await refreshFinancials();
      const [tx, inc, rec] = await Promise.all([
        fetchTransactions(),
        fetchIncomeStatement(),
        fetchReconciliations(),
      ]);
      setTransactions(tx);
      setIncomeRows(inc);
      setReconciliations(rec);
    } finally {
      setBusy(false);
    }
  };

  const pnl = useMemo(() => buildProfitAndLoss(incomeRows), [incomeRows]);

  return (
    <div className="space-y-5 pb-12">
      <div className="page-banner p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
          <Building2 className="h-3.5 w-3.5 text-amber-400" />
          Financial Ledger
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Accounts, Cash &amp; Journals</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-100">
          Every shilling, where it sits and how it got there. Balances are calculated from posted
          journals — nothing on this page is a stored total.
        </p>
      </div>

      {/* Anything here is a financial fact the ledger has lost track of. It is
          shown at the top rather than left for an audit to find. */}
      {ledgerHealth.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-red-900">
                {ledgerHealth.length} ledger integrity issue
                {ledgerHealth.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-red-800">
                {ledgerHealth.slice(0, 6).map((h, i) => (
                  <li key={`${h.check_name}-${i}`}>
                    <span className="font-semibold">{h.subject_ref || h.check_name}</span> —{" "}
                    {h.detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Where the money is. */}
      {moneyPosition && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PositionTile
            label="Cash at Hand"
            value={moneyPosition.cash_at_hand}
            icon={Wallet}
            tone="emerald"
          />
          <PositionTile
            label="Cash at Bank"
            value={moneyPosition.cash_at_bank}
            icon={Landmark}
            tone="sky"
          />
          <PositionTile
            label="Mobile Money"
            value={moneyPosition.mobile_money}
            icon={Smartphone}
            tone="violet"
          />
          <PositionTile
            label="Total Liquidity"
            value={moneyPosition.total_available_liquidity}
            icon={Banknote}
            tone="navy"
          />
        </div>
      )}

      {/* The legacy gap, shown plainly rather than absorbed. */}
      {legacy && Number(legacy.current_balance) !== 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[13px] font-bold text-amber-900">
            Legacy / Unclassified: {formatUGX(Number(legacy.current_balance))}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
            Money that moved before the ledger existed. The system has never recorded whether it was
            cash, bank or mobile money, so it is held here rather than guessed at. Count the till,
            read the bank statement, then set each account&rsquo;s opening balance under
            Reconciliation — the remainder is posted once, with a reason, and stays visible.
          </p>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold transition ${
              tab === t.key
                ? "border-b-2 border-[#0B4394] text-[#0B4394]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center pr-1">
          <button
            type="button"
            onClick={reload}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </nav>

      {tab === "accounts" && (
        <AccountsTab
          accounts={liquid}
          canManage={isAdmin && !isAuditor}
          onOpenLedger={openAccountLedger}
          onAdd={() => setAccountOpen(true)}
          onReconcile={setReconcileFor}
        />
      )}

      {tab === "transactions" && (
        <TransactionsTab
          rows={transactions}
          canReverse={isAdmin && !isAuditor}
          onReverse={setReverseFor}
        />
      )}

      {tab === "capital" && (
        <CapitalTab
          rows={transactions.filter(
            (t) => t.entry_type === "capital_injection" || t.entry_type === "capital_withdrawal",
          )}
          canPost={isAdmin && !isAuditor}
          onRecord={() => setCapitalOpen(true)}
          onTransfer={() => setTransferOpen(true)}
        />
      )}

      {tab === "income" && <IncomeTab pnl={pnl} />}

      {tab === "expenses" && (
        <ExpensesTab rows={transactions.filter((t) => t.entry_type === "expense")} pnl={pnl} />
      )}

      {tab === "reconciliation" && (
        <ReconciliationTab
          rows={reconciliations}
          canReconcile={canPost}
          onReconcile={(accountId) => {
            const account = liquid.find((a) => a.account_id === accountId);
            if (account) setReconcileFor(account);
          }}
        />
      )}

      {tab === "reports" && <ReportsTab position={moneyPosition} accounts={liquid} pnl={pnl} />}

      {/* ---------------------------------------------------------------- */}
      <AccountLedgerModal
        account={ledgerFor}
        rows={ledgerRows}
        onClose={() => {
          setLedgerFor(null);
          setLedgerRows([]);
        }}
      />

      <CapitalModal
        open={capitalOpen}
        accounts={realAccounts}
        onClose={() => setCapitalOpen(false)}
        onSubmit={async (input) => {
          await recordCapital(input);
          await reload();
        }}
      />

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onSubmit={async (input) => {
          await recordInternalTransfer(input);
          await reload();
        }}
      />

      <NewAccountModal
        open={accountOpen}
        branches={branches}
        onClose={() => setAccountOpen(false)}
        onSubmit={async (input) => {
          await createAccount(input);
          await reload();
        }}
      />

      <ReconcileModal
        account={reconcileFor}
        isAdmin={isAdmin}
        onClose={() => setReconcileFor(null)}
        onSubmit={async (input) => {
          await reconcileAccount(input);
          await reload();
        }}
      />

      <ReverseModal
        transaction={reverseFor}
        onClose={() => setReverseFor(null)}
        onSubmit={async (id, reason) => {
          await reverseFinancialTransaction(id, reason);
          await reload();
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  navy: "bg-[#083475] text-white border-blue-900",
};

const PositionTile: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  tone: string;
}> = ({ label, value, icon: Icon, tone }) => (
  <div className={`rounded-xl border p-4 shadow-xs ${TONES[tone]}`}>
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</span>
    </div>
    <p className="mt-1.5 text-lg font-black">{formatUGX(Number(value))}</p>
  </div>
);

const AccountsTab: React.FC<{
  accounts: AccountBalance[];
  canManage: boolean;
  onOpenLedger: (a: AccountBalance) => void;
  onAdd: () => void;
  onReconcile: (a: AccountBalance) => void;
}> = ({ accounts, canManage, onOpenLedger, onAdd, onReconcile }) => (
  <div className="space-y-3">
    {canManage && (
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B4394] px-4 text-[13px] font-semibold text-white hover:bg-[#093672]"
      >
        <Plus className="h-4 w-4" />
        Add account
      </button>
    )}
    <MisTable<AccountBalance>
      columns={[
        {
          key: "name",
          label: "Account",
          width: "22%",
          render: (a) => {
            const Icon = iconFor(a.account_type);
            return (
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="font-semibold text-slate-900">{a.account_name}</span>
                {a.is_legacy && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    legacy
                  </span>
                )}
              </span>
            );
          },
          text: (a) => a.account_name,
        },
        {
          key: "type",
          label: "Type",
          width: "12%",
          render: (a) => TYPE_LABELS[a.account_type],
          text: (a) => TYPE_LABELS[a.account_type],
        },
        {
          key: "branch",
          label: "Branch",
          width: "12%",
          render: (a) => a.branch_name || "Institution-wide",
          text: (a) => a.branch_name || "Institution-wide",
        },
        {
          key: "opening",
          label: "Opening",
          align: "right",
          width: "10%",
          render: (a) => money(Number(a.opening_balance)),
          text: (a) => money(Number(a.opening_balance)),
        },
        {
          key: "in",
          label: "Inflows",
          align: "right",
          width: "11%",
          render: (a) => <span className="text-emerald-700">{money(Number(a.total_inflows))}</span>,
          text: (a) => money(Number(a.total_inflows)),
        },
        {
          key: "out",
          label: "Outflows",
          align: "right",
          width: "11%",
          render: (a) => <span className="text-red-700">{money(Number(a.total_outflows))}</span>,
          text: (a) => money(Number(a.total_outflows)),
        },
        {
          key: "balance",
          label: "Balance",
          align: "right",
          width: "12%",
          render: (a) => (
            <span
              className={`font-bold ${Number(a.current_balance) < 0 ? "text-red-700" : "text-slate-900"}`}
            >
              {money(Number(a.current_balance))}
            </span>
          ),
          text: (a) => money(Number(a.current_balance)),
        },
        {
          key: "last",
          label: "Last activity",
          width: "10%",
          render: (a) => shortDate(a.last_transaction_date) || "—",
          text: (a) => shortDate(a.last_transaction_date) || "—",
        },
        {
          key: "act",
          label: "Action",
          width: "10%",
          render: (a) => (
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onOpenLedger(a)}
                className="rounded bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-600"
              >
                Ledger
              </button>
              {!a.is_legacy && (
                <button
                  type="button"
                  onClick={() => onReconcile(a)}
                  className="rounded bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-300"
                >
                  Count
                </button>
              )}
            </span>
          ),
        },
      ]}
      rows={accounts}
      rowKey={(a) => a.account_id}
      mobileTitle={(a) => a.account_name}
      mobileSubtitle={(a) => `${TYPE_LABELS[a.account_type]} • ${money(Number(a.current_balance))}`}
      emptyMessage="No financial accounts have been set up yet."
    />
  </div>
);

const TransactionsTab: React.FC<{
  rows: FinancialTransactionRow[];
  canReverse: boolean;
  onReverse: (t: FinancialTransactionRow) => void;
}> = ({ rows, canReverse, onReverse }) => (
  <MisTable<FinancialTransactionRow>
    columns={[
      {
        key: "no",
        label: "Number",
        width: "11%",
        render: (t) => <span className="font-mono text-[11px]">{t.transaction_number}</span>,
        text: (t) => t.transaction_number,
      },
      { key: "date", label: "Date", width: "8%", render: (t) => shortDate(t.transaction_date) },
      {
        key: "type",
        label: "Type",
        width: "10%",
        render: (t) => ENTRY_LABELS[t.entry_type] || t.entry_type,
        text: (t) => ENTRY_LABELS[t.entry_type] || t.entry_type,
      },
      {
        key: "desc",
        label: "Description",
        width: "23%",
        render: (t) => t.description,
        text: (t) => t.description,
      },
      {
        key: "accounts",
        label: "Accounts",
        width: "18%",
        render: (t) => <span className="text-[11px] text-slate-600">{t.accounts}</span>,
        text: (t) => t.accounts || "",
      },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        width: "10%",
        render: (t) => <span className="font-semibold">{money(Number(t.amount))}</span>,
        text: (t) => money(Number(t.amount)),
      },
      {
        key: "by",
        label: "Recorded by",
        width: "10%",
        render: (t) => t.created_by_name || "—",
        text: (t) => t.created_by_name || "—",
      },
      {
        key: "status",
        label: "Status",
        width: "10%",
        render: (t) => (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              t.status === "reversed"
                ? "bg-red-100 text-red-800"
                : t.status === "reversal"
                  ? "bg-amber-100 text-amber-800"
                  : t.is_legacy
                    ? "bg-slate-100 text-slate-600"
                    : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {t.status === "reversed"
              ? `reversed by ${t.reversed_by_number || "—"}`
              : t.status === "reversal"
                ? `reverses ${t.reverses_number || "—"}`
                : t.is_legacy
                  ? "legacy"
                  : "posted"}
          </span>
        ),
        text: (t) => t.status,
      },
      {
        key: "act",
        label: "Action",
        width: "8%",
        render: (t) =>
          canReverse && t.status === "posted" ? (
            <button
              type="button"
              onClick={() => onReverse(t)}
              title="Reverse this journal"
              className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
            >
              <Undo2 className="h-3 w-3" />
              Reverse
            </button>
          ) : null,
      },
    ]}
    rows={rows}
    rowKey={(t) => t.id}
    maxHeight="65vh"
    mobileTitle={(t) => t.transaction_number}
    mobileSubtitle={(t) => `${shortDate(t.transaction_date)} • ${money(Number(t.amount))}`}
    emptyMessage="No financial transactions yet."
  />
);

const CapitalTab: React.FC<{
  rows: FinancialTransactionRow[];
  canPost: boolean;
  onRecord: () => void;
  onTransfer: () => void;
}> = ({ rows, canPost, onRecord, onTransfer }) => (
  <div className="space-y-3">
    {canPost && (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRecord}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B4394] px-4 text-[13px] font-semibold text-white hover:bg-[#093672]"
        >
          <TrendingUp className="h-4 w-4" />
          Record capital
        </button>
        <button
          type="button"
          onClick={onTransfer}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Move money between accounts
        </button>
      </div>
    )}
    <p className="text-[12px] leading-relaxed text-slate-500">
      Capital is equity, not income: it never appears in the Profit &amp; Loss. Moving money between
      Chetu&rsquo;s own accounts is neither — a transfer touches no income or expense account at
      all, so it cannot inflate either.
    </p>
    <MisTable<FinancialTransactionRow>
      columns={[
        {
          key: "no",
          label: "Number",
          width: "14%",
          render: (t) => <span className="font-mono text-[11px]">{t.transaction_number}</span>,
          text: (t) => t.transaction_number,
        },
        { key: "date", label: "Date", width: "10%", render: (t) => shortDate(t.transaction_date) },
        {
          key: "dir",
          label: "Direction",
          width: "12%",
          render: (t) =>
            t.entry_type === "capital_injection" ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <TrendingUp className="h-3 w-3" /> In
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-700">
                <TrendingDown className="h-3 w-3" /> Out
              </span>
            ),
          text: (t) => (t.entry_type === "capital_injection" ? "In" : "Out"),
        },
        {
          key: "dest",
          label: "Account",
          width: "20%",
          render: (t) => t.destination_account || t.source_account || "—",
          text: (t) => t.destination_account || t.source_account || "—",
        },
        {
          key: "desc",
          label: "Description",
          width: "24%",
          render: (t) => t.description,
          text: (t) => t.description,
        },
        {
          key: "ref",
          label: "Reference",
          width: "10%",
          render: (t) => t.reference_number || "—",
          text: (t) => t.reference_number || "—",
        },
        {
          key: "amount",
          label: "Amount",
          align: "right",
          width: "10%",
          render: (t) => <span className="font-semibold">{money(Number(t.amount))}</span>,
          text: (t) => money(Number(t.amount)),
        },
      ]}
      rows={rows}
      rowKey={(t) => t.id}
      mobileTitle={(t) => t.transaction_number}
      mobileSubtitle={(t) => money(Number(t.amount))}
      emptyMessage="No capital has been recorded yet."
    />
  </div>
);

const IncomeTab: React.FC<{ pnl: ReturnType<typeof buildProfitAndLoss> }> = ({ pnl }) => (
  <div className="space-y-3">
    <p className="text-[12px] leading-relaxed text-slate-500">
      Income only. Loan principal coming back is not revenue — it is money returning to the same
      balance sheet it left, and it never touches an income account, so it cannot appear here.
    </p>
    <MisTable<{ code: string; name: string; amount: number }>
      columns={[
        {
          key: "name",
          label: "Income category",
          width: "60%",
          render: (r) => r.name,
          text: (r) => r.name,
        },
        { key: "code", label: "Code", width: "20%", render: (r) => r.code, text: (r) => r.code },
        {
          key: "amount",
          label: "Amount",
          align: "right",
          width: "20%",
          render: (r) => <span className="font-semibold">{money(r.amount)}</span>,
          text: (r) => money(r.amount),
        },
      ]}
      rows={pnl.income}
      rowKey={(r) => r.code}
      emptyMessage="No income has been recognised yet."
      footer={
        <div className="flex items-center justify-between px-4 py-2.5 text-[13px] font-bold">
          <span>Total income</span>
          <span className="text-emerald-700">{money(pnl.totalIncome)}</span>
        </div>
      }
    />
  </div>
);

const ExpensesTab: React.FC<{
  rows: FinancialTransactionRow[];
  pnl: ReturnType<typeof buildProfitAndLoss>;
}> = ({ rows, pnl }) => (
  <div className="space-y-4">
    <MisTable<{ code: string; name: string; amount: number }>
      columns={[
        {
          key: "name",
          label: "Expense category",
          width: "60%",
          render: (r) => r.name,
          text: (r) => r.name,
        },
        { key: "code", label: "Code", width: "20%", render: (r) => r.code, text: (r) => r.code },
        {
          key: "amount",
          label: "Amount",
          align: "right",
          width: "20%",
          render: (r) => <span className="font-semibold">{money(r.amount)}</span>,
          text: (r) => money(r.amount),
        },
      ]}
      rows={pnl.expenses}
      rowKey={(r) => r.code}
      emptyMessage="No expenses have been recorded yet."
      footer={
        <div className="flex items-center justify-between px-4 py-2.5 text-[13px] font-bold">
          <span>Total expenses</span>
          <span className="text-red-700">{money(pnl.totalExpenses)}</span>
        </div>
      }
    />
    <MisTable<FinancialTransactionRow>
      columns={[
        { key: "date", label: "Date", width: "10%", render: (t) => shortDate(t.transaction_date) },
        {
          key: "no",
          label: "Voucher",
          width: "12%",
          render: (t) => t.expense_number || t.transaction_number,
          text: (t) => t.expense_number || t.transaction_number,
        },
        {
          key: "desc",
          label: "Description",
          width: "30%",
          render: (t) => t.description,
          text: (t) => t.description,
        },
        {
          key: "src",
          label: "Paid from",
          width: "18%",
          render: (t) => t.source_account || "—",
          text: (t) => t.source_account || "—",
        },
        {
          key: "branch",
          label: "Branch",
          width: "12%",
          render: (t) => t.branch_name || "—",
          text: (t) => t.branch_name || "—",
        },
        {
          key: "by",
          label: "By",
          width: "10%",
          render: (t) => t.created_by_name || "—",
          text: (t) => t.created_by_name || "—",
        },
        {
          key: "amount",
          label: "Amount",
          align: "right",
          width: "10%",
          render: (t) => money(Number(t.amount)),
          text: (t) => money(Number(t.amount)),
        },
      ]}
      rows={rows}
      rowKey={(t) => t.id}
      mobileTitle={(t) => t.description}
      mobileSubtitle={(t) => `${shortDate(t.transaction_date)} • ${money(Number(t.amount))}`}
      emptyMessage="No expense journals yet."
    />
  </div>
);

const ReconciliationTab: React.FC<{
  rows: AccountReconciliationRow[];
  canReconcile: boolean;
  onReconcile: (accountId: string) => void;
}> = ({ rows, canReconcile, onReconcile }) => (
  <div className="space-y-3">
    <p className="text-[12px] leading-relaxed text-slate-500">
      Count the till, read the statement, enter what is actually there. A difference is recorded and
      left visible until an Administrator explains it — it is never absorbed quietly.
    </p>
    <MisTable<AccountReconciliationRow>
      columns={[
        {
          key: "acct",
          label: "Account",
          width: "20%",
          render: (r) => r.account_name,
          text: (r) => r.account_name,
        },
        {
          key: "sys",
          label: "System balance",
          align: "right",
          width: "14%",
          render: (r) => money(Number(r.system_balance)),
          text: (r) => money(Number(r.system_balance)),
        },
        {
          key: "actual",
          label: "Counted",
          align: "right",
          width: "14%",
          render: (r) => (r.actual_balance == null ? "—" : money(Number(r.actual_balance))),
          text: (r) => (r.actual_balance == null ? "—" : money(Number(r.actual_balance))),
        },
        {
          key: "diff",
          label: "Difference",
          align: "right",
          width: "12%",
          render: (r) =>
            r.difference == null ? (
              "—"
            ) : (
              <span
                className={
                  Number(r.difference) === 0 ? "text-emerald-700" : "font-bold text-red-700"
                }
              >
                {money(Number(r.difference))}
              </span>
            ),
          text: (r) => (r.difference == null ? "—" : money(Number(r.difference))),
        },
        {
          key: "on",
          label: "Counted on",
          width: "11%",
          render: (r) => shortDate(r.reconciled_on) || "—",
        },
        {
          key: "by",
          label: "By",
          width: "11%",
          render: (r) => r.reconciled_by_name || "—",
          text: (r) => r.reconciled_by_name || "—",
        },
        {
          key: "state",
          label: "State",
          width: "12%",
          render: (r) => (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                r.state === "Accepted" || r.state === "Adjusted"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {r.state === "Accepted" || r.state === "Adjusted" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {r.state}
            </span>
          ),
          text: (r) => r.state,
        },
        {
          key: "act",
          label: "Action",
          width: "6%",
          render: (r) =>
            canReconcile ? (
              <button
                type="button"
                onClick={() => onReconcile(r.account_id)}
                className="rounded bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-600"
              >
                Count
              </button>
            ) : null,
        },
      ]}
      rows={rows}
      rowKey={(r) => r.account_id}
      mobileTitle={(r) => r.account_name}
      mobileSubtitle={(r) => r.state}
      emptyMessage="No accounts to reconcile."
    />
  </div>
);

const ReportsTab: React.FC<{
  position: ReturnType<typeof useDatabase>["moneyPosition"];
  accounts: AccountBalance[];
  pnl: ReturnType<typeof buildProfitAndLoss>;
}> = ({ position, pnl }) => (
  <div className="grid gap-4 lg:grid-cols-2">
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
        <Scale className="h-4 w-4 text-[#0B4394]" />
        Statement of Financial Position
      </h3>
      {position && (
        <dl className="mt-3 space-y-1.5 text-[13px]">
          <Row label="Cash at hand" value={position.cash_at_hand} />
          <Row label="Cash at bank" value={position.cash_at_bank} />
          <Row label="Mobile money / merchant" value={position.mobile_money} />
          {Number(position.unclassified_legacy) !== 0 && (
            <Row label="Legacy / unclassified" value={position.unclassified_legacy} muted />
          )}
          <Row label="Loans receivable" value={position.outstanding_principal} />
          <Row label="Total assets (ledger)" value={position.total_assets_ledger} strong />
          <Row label="Member security held" value={-position.security_held} />
          {Number(position.unidentified_funding) !== 0 && (
            <Row
              label="Unidentified historical funding"
              value={-position.unidentified_funding}
            />
          )}
          <Row label="Capital introduced" value={position.capital_introduced} />
          <Row label="Retained result" value={position.net_result} />
          <Row label="Net worth (ledger)" value={position.net_worth_ledger} strong />
        </dl>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Assets less liabilities equals capital plus the retained result. Interest members are
        contracted to pay but have not yet is deliberately excluded: it is real, and it is shown on
        the dashboard, but it is not yet income.
      </p>
    </div>

    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
        <FileText className="h-4 w-4 text-[#0B4394]" />
        Profit &amp; Loss
      </h3>
      <dl className="mt-3 space-y-1.5 text-[13px]">
        {pnl.income.map((r) => (
          <Row key={r.code} label={r.name} value={r.amount} />
        ))}
        <Row label="Total income" value={pnl.totalIncome} strong />
        {pnl.expenses.map((r) => (
          <Row key={r.code} label={r.name} value={-r.amount} />
        ))}
        <Row label="Total expenses" value={-pnl.totalExpenses} strong />
        <Row label="Net result" value={pnl.netResult} strong />
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Returned loan principal is not here, and cannot be: it never touches an income account.
      </p>
    </div>
  </div>
);

const Row: React.FC<{ label: string; value: number; strong?: boolean; muted?: boolean }> = ({
  label,
  value,
  strong,
  muted,
}) => (
  <div
    className={`flex items-baseline justify-between gap-3 ${
      strong ? "border-t border-slate-200 pt-1.5 font-bold text-slate-900" : ""
    } ${muted ? "text-amber-700" : ""}`}
  >
    <dt className={strong ? "" : "text-slate-600"}>{label}</dt>
    <dd className={Number(value) < 0 && !strong ? "text-red-700" : ""}>
      {formatUGX(Number(value))}
    </dd>
  </div>
);

export default FinancialLedger;
