/**
 * The dialogs the Financial Ledger posts through.
 *
 * Each one collects the minimum a balanced journal needs and then lets the
 * database decide. Errors are shown as the database wrote them — it names the
 * account, the branch or the permission that stopped the posting, which is
 * more use than "something went wrong", and swallowing that detail is how
 * fifteen disbursements went missing in the first place.
 */
import React, { useEffect, useState } from "react";
import { MisModal, MisTable, money, shortDate } from "../../components/mis/MisKit";
import { AccountSelect } from "../../components/financial/AccountSelect";
import { formatUGX } from "../../lib/loanCalculations";
import type {
  AccountBalance,
  AccountLedgerRow,
  Branch,
  FinancialAccountType,
  FinancialTransactionRow,
} from "../../types/database.types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Please try again.");

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <div>
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
  </div>
);

const Err: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-800">
      {message}
    </p>
  ) : null;

const Actions: React.FC<{
  onCancel: () => void;
  busy: boolean;
  label: string;
  disabled?: boolean;
}> = ({ onCancel, busy, label, disabled }) => (
  <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
    <button
      type="button"
      onClick={onCancel}
      className="rounded-lg bg-slate-100 px-4 py-2 text-[13px] font-bold text-slate-700"
    >
      Cancel
    </button>
    <button
      type="submit"
      disabled={busy || disabled}
      className="rounded-lg bg-[#0B4394] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#093672] disabled:opacity-50"
    >
      {busy ? "Posting…" : label}
    </button>
  </div>
);

// ---------------------------------------------------------------------------

export const AccountLedgerModal: React.FC<{
  account: AccountBalance | null;
  rows: AccountLedgerRow[];
  onClose: () => void;
}> = ({ account, rows, onClose }) => (
  <MisModal
    open={!!account}
    onClose={onClose}
    title={account ? `${account.account_name} — ledger` : "Ledger"}
    width="max-w-5xl"
  >
    {account && (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Opening" value={Number(account.opening_balance)} />
          <Stat label="Inflows" value={Number(account.total_inflows)} tone="emerald" />
          <Stat label="Outflows" value={Number(account.total_outflows)} tone="red" />
          <Stat label="Balance" value={Number(account.current_balance)} tone="navy" />
        </div>
        <MisTable<AccountLedgerRow>
          columns={[
            {
              key: "date",
              label: "Date",
              width: "10%",
              render: (r) => shortDate(r.transaction_date),
            },
            {
              key: "no",
              label: "Journal",
              width: "14%",
              render: (r) => <span className="font-mono text-[11px]">{r.transaction_number}</span>,
              text: (r) => r.transaction_number,
            },
            {
              key: "desc",
              label: "Description",
              width: "36%",
              render: (r) => r.description,
              text: (r) => r.description,
            },
            {
              key: "in",
              label: "In",
              align: "right",
              width: "13%",
              render: (r) =>
                r.direction === "debit" ? (
                  <span className="text-emerald-700">{money(Number(r.amount))}</span>
                ) : (
                  "—"
                ),
              text: (r) => (r.direction === "debit" ? money(Number(r.amount)) : "—"),
            },
            {
              key: "out",
              label: "Out",
              align: "right",
              width: "13%",
              render: (r) =>
                r.direction === "credit" ? (
                  <span className="text-red-700">{money(Number(r.amount))}</span>
                ) : (
                  "—"
                ),
              text: (r) => (r.direction === "credit" ? money(Number(r.amount)) : "—"),
            },
            {
              key: "bal",
              label: "Balance",
              align: "right",
              width: "14%",
              render: (r) => (
                <span className="font-semibold">{money(Number(r.running_balance))}</span>
              ),
              text: (r) => money(Number(r.running_balance)),
            },
          ]}
          rows={rows}
          rowKey={(r) => `${r.transaction_id}-${r.line_no}`}
          maxHeight="50vh"
          mobileTitle={(r) => r.transaction_number}
          mobileSubtitle={(r) => `${shortDate(r.transaction_date)} • ${money(Number(r.amount))}`}
          emptyMessage="Nothing has been posted to this account yet."
        />
      </div>
    )}
  </MisModal>
);

const Stat: React.FC<{ label: string; value: number; tone?: string }> = ({
  label,
  value,
  tone = "slate",
}) => {
  const tones: Record<string, string> = {
    slate: "text-slate-900",
    emerald: "text-emerald-700",
    red: "text-red-700",
    navy: "text-[#0B4394]",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-[15px] font-black ${tones[tone]}`}>{formatUGX(value)}</p>
    </div>
  );
};

// ---------------------------------------------------------------------------

export const CapitalModal: React.FC<{
  open: boolean;
  accounts: AccountBalance[];
  onClose: () => void;
  onSubmit: (input: {
    accountId: string;
    amount: number;
    direction: "in" | "out";
    date?: string;
    reference?: string | null;
    note?: string | null;
  }) => Promise<void>;
}> = ({ open, onClose, onSubmit }) => {
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        accountId,
        amount: Number(amount),
        direction,
        date,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      onClose();
      setAmount("");
      setReference("");
      setNote("");
    } catch (e2) {
      setError(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MisModal open={open} onClose={onClose} title="Record capital" width="max-w-lg">
      <form onSubmit={submit} className="space-y-4 text-[13px]">
        <Err message={error} />
        <Field label="Direction">
          <div className="flex gap-2">
            {(["in", "out"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
                  direction === d
                    ? "border-[#0B4394] bg-[#0B4394] text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {d === "in" ? "Capital in" : "Capital out"}
              </button>
            ))}
          </div>
        </Field>

        <AccountSelect
          value={accountId}
          onChange={setAccountId}
          direction={direction === "in" ? "destination" : "source"}
          label={direction === "in" ? "Received into account" : "Paid out of account"}
        />

        <Field label="Amount (UGX)">
          <input
            type="number"
            min={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Reference">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
        </div>

        <Field
          label="Description"
          hint="Capital is equity, not income — it will not appear in the Profit & Loss."
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Owner funding, shareholder injection…"
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </Field>

        <Actions
          onCancel={onClose}
          busy={busy}
          label="Post capital"
          disabled={!accountId || !amount}
        />
      </form>
    </MisModal>
  );
};

// ---------------------------------------------------------------------------

export const TransferModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date?: string;
    reference?: string | null;
    note?: string | null;
  }) => Promise<void>;
}> = ({ open, onClose, onSubmit }) => {
  const [fromAccountId, setFrom] = useState("");
  const [toAccountId, setTo] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        fromAccountId,
        toAccountId,
        amount: Number(amount),
        date,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      onClose();
      setAmount("");
      setReference("");
      setNote("");
    } catch (e2) {
      setError(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MisModal open={open} onClose={onClose} title="Move money between accounts" width="max-w-lg">
      <form onSubmit={submit} className="space-y-4 text-[13px]">
        <Err message={error} />
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] leading-relaxed text-sky-900">
          Bank to till, till to bank, head office to a branch, cash to a wallet. Total liquidity
          does not change and no income or expense is created — the journal touches neither.
        </p>

        <AccountSelect
          value={fromAccountId}
          onChange={setFrom}
          direction="source"
          label="Money leaves"
        />
        <AccountSelect
          value={toAccountId}
          onChange={setTo}
          direction="destination"
          label="Money arrives in"
        />

        {fromAccountId && fromAccountId === toAccountId && (
          <p className="text-[12px] font-semibold text-red-700">
            Pick two different accounts — money cannot move to where it already is.
          </p>
        )}

        <Field label="Amount (UGX)">
          <input
            type="number"
            min={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Reference">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
        </div>

        <Field label="Description">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cash withdrawn for field collections…"
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </Field>

        <Actions
          onCancel={onClose}
          busy={busy}
          label="Post transfer"
          disabled={!fromAccountId || !toAccountId || fromAccountId === toAccountId || !amount}
        />
      </form>
    </MisModal>
  );
};

// ---------------------------------------------------------------------------

const ACCOUNT_TYPES: { value: FinancialAccountType; label: string; hint: string }[] = [
  { value: "cash_at_hand", label: "Cash at Hand", hint: "Notes held at head office" },
  { value: "cashier_till", label: "Cashier Till", hint: "A named teller's float" },
  { value: "branch_cash", label: "Branch Cash", hint: "Cash held at a branch" },
  { value: "bank", label: "Bank Account", hint: "A real account at a bank" },
  { value: "mobile_money", label: "Mobile Money", hint: "An MTN or Airtel wallet" },
  { value: "merchant", label: "Merchant Account", hint: "A merchant or agent float" },
];

export const NewAccountModal: React.FC<{
  open: boolean;
  branches: Branch[];
  onClose: () => void;
  onSubmit: (input: {
    account_code: string;
    account_name: string;
    account_type: FinancialAccountType;
    account_class: "asset_liquid";
    branch_id?: string | null;
    institution?: string | null;
    account_reference?: string | null;
  }) => Promise<void>;
}> = ({ open, branches, onClose, onSubmit }) => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<FinancialAccountType>("bank");
  const [branchId, setBranchId] = useState("");
  const [institution, setInstitution] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A readable code, derived from the name, that the operator can still edit.
  useEffect(() => {
    if (!name) return;
    setCode((current) =>
      current && current !== autoCode(name.slice(0, current.length)) ? current : autoCode(name),
    );
  }, [name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        account_code: code.trim().toUpperCase(),
        account_name: name.trim(),
        account_type: type,
        account_class: "asset_liquid",
        branch_id: branchId || null,
        institution: institution.trim() || null,
        account_reference: reference.trim() || null,
      });
      onClose();
      setName("");
      setCode("");
      setInstitution("");
      setReference("");
    } catch (e2) {
      setError(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MisModal open={open} onClose={onClose} title="Add a financial account" width="max-w-lg">
      <form onSubmit={submit} className="space-y-4 text-[13px]">
        <Err message={error} />
        <Field label="Account name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stanbic Current Account, Buyende Till…"
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </Field>

        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FinancialAccountType)}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.hint}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" hint="Used in reports. Must be unique.">
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 font-mono uppercase"
            />
          </Field>
          <Field label="Branch" hint="Leave blank for an institution-wide account.">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="">Institution-wide</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Institution / provider">
            <input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Bank or wallet provider"
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Account / wallet number">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          The account opens at zero. Set its real balance under Reconciliation once it has been
          counted or the statement has been read.
        </p>

        <Actions onCancel={onClose} busy={busy} label="Create account" disabled={!name || !code} />
      </form>
    </MisModal>
  );
};

const autoCode = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

// ---------------------------------------------------------------------------

export const ReconcileModal: React.FC<{
  account: AccountBalance | null;
  isAdmin: boolean;
  onClose: () => void;
  onSubmit: (input: {
    accountId: string;
    actualBalance: number;
    reconciledOn?: string;
    statementReference?: string | null;
    notes?: string | null;
    postAdjustment?: boolean;
    adjustmentReason?: string | null;
  }) => Promise<void>;
}> = ({ account, isAdmin, onClose, onSubmit }) => {
  const [actual, setActual] = useState<number | "">("");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [adjust, setAdjust] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setActual("");
      setAdjust(false);
      setReason("");
      setError(null);
    }
  }, [account]);

  if (!account) return null;

  const system = Number(account.current_balance);
  const difference = actual === "" ? null : Number(actual) - system;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        accountId: account.account_id,
        actualBalance: Number(actual),
        reconciledOn: on,
        statementReference: reference.trim() || null,
        notes: notes.trim() || null,
        postAdjustment: adjust,
        adjustmentReason: adjust ? reason.trim() : null,
      });
      onClose();
    } catch (e2) {
      setError(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MisModal
      open={!!account}
      onClose={onClose}
      title={`Reconcile ${account.account_name}`}
      width="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4 text-[13px]">
        <Err message={error} />

        <div className="grid grid-cols-3 gap-3">
          <Stat label="System says" value={system} />
          <Stat label="Counted" value={actual === "" ? 0 : Number(actual)} tone="navy" />
          <Stat
            label="Difference"
            value={difference ?? 0}
            tone={difference === null || difference === 0 ? "emerald" : "red"}
          />
        </div>

        <Field
          label="Counted / statement balance (UGX)"
          hint="What is physically in the till, or what the bank statement says."
        >
          <input
            type="number"
            required
            min={0}
            value={actual}
            onChange={(e) => setActual(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Counted on">
            <input
              type="date"
              required
              value={on}
              onChange={(e) => setOn(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Statement reference">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </Field>

        {difference !== null && difference !== 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[12px] leading-relaxed text-amber-900">
              The count differs from the ledger by{" "}
              <span className="font-bold">{formatUGX(difference)}</span>. Recording it without an
              adjustment leaves the difference open and visible, which is the right thing to do
              until someone knows why.
            </p>
            {isAdmin ? (
              <>
                <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-amber-900">
                  <input
                    type="checkbox"
                    checked={adjust}
                    onChange={(e) => setAdjust(e.target.checked)}
                  />
                  Post an adjustment so the ledger matches the count
                </label>
                {adjust && (
                  <input
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is there a difference?"
                    className="mt-2 h-10 w-full rounded-lg border border-amber-300 px-3 text-[13px]"
                  />
                )}
              </>
            ) : (
              <p className="mt-2 text-[11px] font-semibold text-amber-800">
                Only an Administrator can post the adjustment that closes it.
              </p>
            )}
          </div>
        )}

        <Actions onCancel={onClose} busy={busy} label="Record count" disabled={actual === ""} />
      </form>
    </MisModal>
  );
};

// ---------------------------------------------------------------------------

export const ReverseModal: React.FC<{
  transaction: FinancialTransactionRow | null;
  onClose: () => void;
  onSubmit: (id: string, reason: string) => Promise<void>;
}> = ({ transaction, onClose, onSubmit }) => {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transaction) {
      setReason("");
      setError(null);
    }
  }, [transaction]);

  if (!transaction) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(transaction.id, reason.trim());
      onClose();
    } catch (e2) {
      setError(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MisModal
      open={!!transaction}
      onClose={onClose}
      title={`Reverse ${transaction.transaction_number}`}
      width="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4 text-[13px]">
        <Err message={error} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="font-semibold text-slate-900">{transaction.description}</p>
          <p className="mt-0.5 text-[12px] text-slate-600">
            {shortDate(transaction.transaction_date)} • {formatUGX(Number(transaction.amount))} •{" "}
            {transaction.accounts}
          </p>
        </div>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          Every line of this journal is mirrored into a new one that references it. Nothing is
          deleted: the original stays in the ledger, marked reversed, so the history reads correctly
          afterwards.
        </p>
        <Field label="Why is this being reversed?">
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </Field>
        <Actions onCancel={onClose} busy={busy} label="Post reversal" disabled={!reason.trim()} />
      </form>
    </MisModal>
  );
};
