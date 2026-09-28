/**
 * Shared loading for the financial reports.
 *
 * Each hook wraps one database view. Reports do not re-derive money: the
 * splitting, ageing and balancing all happened in SQL, where the ledger's own
 * constraints hold them honest. A report that recomputed any of it would be
 * the fourth independent implementation of the same arithmetic, which is the
 * thing this work exists to remove.
 */
import { useEffect, useMemo, useState } from "react";
import { useDatabase } from "../../context/DatabaseContext";
import {
  fetchAccountBalances,
  fetchBorrowerStatements,
  fetchBranchFinancials,
  fetchCashFlow,
  fetchIncomeStatement,
  fetchLoanPortfolio,
  fetchOfficerPerformance,
  fetchParAgeing,
  fetchReconciliations,
  fetchRepaymentAllocations,
  fetchTransactions,
  type DateRange,
} from "../../lib/financial/reports";
import type {
  AccountBalance,
  AccountReconciliationRow,
  BorrowerStatementRow,
  BranchFinancialsRow,
  CashFlowRow,
  FinancialTransactionRow,
  IncomeStatementRow,
  LoanPortfolioRow,
  OfficerPerformanceRow,
  ParAgeingRow,
  RepaymentAllocationRow,
} from "../../types/database.types";

/** Loads a view, re-reading whenever the ledger moves. */
function useView<T>(load: () => Promise<T[]>, deps: unknown[] = []) {
  const { dataVersion } = useDatabase();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A report that silently shows nothing looks like a quiet period. Say
        // that it failed instead.
        setError(e instanceof Error ? e.message : "Could not load this report");
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, ...deps]);

  return { rows, loading, error };
}

export const useAccountBalancesView = () => useView<AccountBalance>(fetchAccountBalances);
export const useLoanPortfolioView = () => useView<LoanPortfolioRow>(fetchLoanPortfolio);
export const useParAgeingView = () => useView<ParAgeingRow>(fetchParAgeing);
export const useBranchFinancialsView = () => useView<BranchFinancialsRow>(fetchBranchFinancials);
export const useOfficerPerformanceView = () =>
  useView<OfficerPerformanceRow>(fetchOfficerPerformance);
export const useBorrowerStatementsView = () =>
  useView<BorrowerStatementRow>(fetchBorrowerStatements);
export const useReconciliationView = () => useView<AccountReconciliationRow>(fetchReconciliations);

export const useCollectionsView = (range: DateRange = {}) =>
  useView<RepaymentAllocationRow>(() => fetchRepaymentAllocations(range), [range.from, range.to]);

export const useCashFlowView = (range: DateRange = {}) =>
  useView<CashFlowRow>(() => fetchCashFlow(range), [range.from, range.to]);

export const useIncomeStatementView = (range: DateRange = {}) =>
  useView<IncomeStatementRow>(() => fetchIncomeStatement(range), [range.from, range.to]);

export const useTransactionsView = (
  filters: DateRange & { branchId?: string | null; entryType?: string | null } = {},
) =>
  useView<FinancialTransactionRow>(
    () => fetchTransactions(filters),
    [filters.from, filters.to, filters.branchId, filters.entryType],
  );

/** A month-to-date range, the default window most of these reports open on. */
export const monthToDate = (): DateRange => {
  const now = new Date();
  return {
    from: `${now.toISOString().slice(0, 7)}-01`,
    to: now.toISOString().slice(0, 10),
  };
};

/** Folds income-statement rows into totals per account, income and expense apart. */
export const useIncomeExpenseTotals = (rows: IncomeStatementRow[]) =>
  useMemo(() => {
    const byCode = new Map<
      string,
      { code: string; name: string; amount: number; kind: "income" | "expense"; sort: number }
    >();
    for (const r of rows) {
      const entry = byCode.get(r.account_code) ?? {
        code: r.account_code,
        name: r.account_name,
        amount: 0,
        kind: r.account_class,
        sort: r.sort_order,
      };
      entry.amount += Number(r.income_amount || 0) + Number(r.expense_amount || 0);
      byCode.set(r.account_code, entry);
    }
    const all = [...byCode.values()].sort((a, b) => a.sort - b.sort);
    const income = all.filter((r) => r.kind === "income");
    const expenses = all.filter((r) => r.kind === "expense");
    return {
      income,
      expenses,
      totalIncome: income.reduce((t, r) => t + r.amount, 0),
      totalExpenses: expenses.reduce((t, r) => t + r.amount, 0),
    };
  }, [rows]);
