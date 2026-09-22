import React, { createContext, useContext, useState, useEffect } from "react";
import {
  Client,
  LoanProduct,
  LoanApplication,
  Loan,
  LoanRepayment,
  Expense,
  BankTransaction,
  AuditLog,
  SystemSettings,
  ClientGroup,
  RepaymentStatus,
  SavingsAccount,
  SavingsTransaction,
  GroupAttendance,
  PaymentMethod,
  SavingsTransactionType,
  WeeklyScheduleRow,
  LoanStatus,
  Branch,
  Transfer,
  CLOSED_LOAN_STATUSES,
} from "../types/database.types";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { sendNotification } from "../lib/notify";
import { defaultSettings } from "../lib/defaults";
import { calculateLoanSchedule } from "../lib/loanCalculations";
import { graceDaysFor, resolveFirstRepaymentDate, weeklyDueDates } from "../lib/meetingDay";
import { persistApprovedLoan } from "../lib/approvalPersistence";
import { allocatePayment } from "../lib/scheduleView";
import { fetchAllRows } from "../lib/fetchAll";
import { FEES, loanFees } from "../lib/fees";
import { useAuth } from "./AuthContext";

interface GlobalSearchResult {
  type: "Client" | "Loan" | "Application" | "Product" | "Group" | "Savings";
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

interface DatabaseContextType {
  branches: Branch[];
  clients: Client[];
  clientGroups: ClientGroup[];
  loanProducts: LoanProduct[];
  loanApplications: LoanApplication[];
  loans: Loan[];
  repayments: LoanRepayment[];
  savingsAccounts: SavingsAccount[];
  savingsTransactions: SavingsTransaction[];
  groupAttendance: GroupAttendance[];
  expenses: Expense[];
  bankTransactions: BankTransaction[];
  auditLogs: AuditLog[];
  transfers: Transfer[];
  settings: SystemSettings;
  isLoading: boolean;
  selectedBranchId: string;
  setSelectedBranchId: (branchId: string) => void;

  currentBankBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalCollectionsToday: number;
  totalCollectionsWeekly: number;
  totalCollectionsMonthly: number;
  totalExpenses: number;
  totalSavingsBalance: number;

  addBranch: (branch: Omit<Branch, "id" | "created_at">) => Promise<Branch>;
  updateBranch: (id: string, branchData: Partial<Branch>) => Promise<void>;
  deleteBranch: (id: string) => Promise<void>;
  deactivateBranch: (id: string, reason: string) => Promise<void>;
  reactivateBranch: (id: string) => Promise<void>;
  branchLinkedRecordCount: (id: string) => number;
  addClient: (
    client: Omit<Client, "id" | "client_number" | "created_at" | "approval_status">,
  ) => Promise<Client>;
  updateClient: (id: string, clientData: Partial<Client>) => Promise<void>;
  approveClient: (id: string) => Promise<void>;
  rejectClient: (id: string, reason: string) => Promise<void>;
  declareClientDeath: (id: string, deathDate: string) => Promise<void>;
  addClientGroup: (
    group: Omit<
      ClientGroup,
      "id" | "group_code" | "member_count" | "created_at" | "approval_status"
    >,
  ) => Promise<ClientGroup>;
  updateClientGroup: (id: string, groupData: Partial<ClientGroup>) => Promise<void>;
  deleteClientGroup: (id: string) => Promise<void>;
  approveClientGroup: (id: string) => Promise<void>;
  rejectClientGroup: (id: string, reason: string) => Promise<void>;
  addLoanProduct: (product: Omit<LoanProduct, "id" | "created_at">) => Promise<LoanProduct>;
  updateLoanProduct: (id: string, productData: Partial<LoanProduct>) => Promise<void>;
  submitLoanApplication: (
    app: Omit<LoanApplication, "id" | "application_number" | "status" | "created_at">,
  ) => Promise<LoanApplication>;
  approveLoanApplication: (appId: string) => Promise<Loan>;
  rejectLoanApplication: (appId: string, reason: string) => Promise<void>;
  resubmitLoanApplication: (appId: string) => Promise<void>;
  disburseLoan: (loanId: string) => Promise<void>;
  recordRepayment: (
    loanId: string,
    amount: number,
    method: PaymentMethod,
    notes?: string,
  ) => Promise<LoanRepayment>;
  settleLoan: (
    loanId: string,
    amount: number,
    method: PaymentMethod,
    notes?: string,
  ) => Promise<LoanRepayment>;
  writeOffLoan: (loanId: string, reason: string) => Promise<void>;
  undoDisbursement: (loanId: string, reason: string) => Promise<void>;
  undoRepayment: (repaymentId: string, reason: string) => Promise<void>;
  requestMemberTransfer: (input: {
    clientId: string;
    toBranchId: string;
    toGroupId?: string;
    toOfficerId?: string;
    reason: string;
  }) => Promise<Transfer>;
  receiveMemberTransfer: (
    transferId: string,
    toGroupId?: string,
    toOfficerId?: string,
  ) => Promise<void>;
  rejectMemberTransfer: (transferId: string, reason: string) => Promise<void>;
  cancelMemberTransfer: (transferId: string) => Promise<void>;
  transferMemberGroup: (clientId: string, toGroupId: string, reason?: string) => Promise<void>;
  transferGroupOfficer: (groupId: string, toOfficerId: string, reason?: string) => Promise<void>;
  addSavingsTransaction: (
    accountId: string,
    amount: number,
    type: SavingsTransactionType,
    method: PaymentMethod,
    notes?: string,
  ) => Promise<SavingsTransaction>;
  recordGroupAttendance: (
    groupId: string,
    meetingDate: string,
    attendees: string[],
    notes?: string,
  ) => Promise<GroupAttendance>;
  addExpense: (expense: Omit<Expense, "id" | "expense_number" | "created_at">) => Promise<Expense>;
  addBankTransaction: (
    tx: Omit<BankTransaction, "id" | "transaction_number" | "balance_after" | "created_at">,
  ) => Promise<BankTransaction>;
  updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>;
  performGlobalSearch: (query: string) => GlobalSearchResult[];
  logAudit: (action: string, module: string, details: string, record_id?: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  refetch: (options?: { silent?: boolean }) => Promise<void>;
  /**
   * Incremented every time `refetch` completes.
   *
   * Screens that fetch their own data outside this context (the report hooks,
   * the loan-officer picker, per-page lists) put this in their effect's
   * dependency array so the header's Refresh reaches them too — otherwise
   * Refresh only reloads the tables this context happens to own and the rest
   * of the screen keeps showing stale rows.
   */
  dataVersion: number;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, isAdmin, isAuditor, isBranchManager, isLoanOfficer, isAuthResolved } =
    useAuth();

  const [dataVersion, setDataVersion] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [repayments, setRepayments] = useState<LoanRepayment[]>([]);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [savingsTransactions, setSavingsTransactions] = useState<SavingsTransaction[]>([]);
  const [groupAttendance, setGroupAttendance] = useState<GroupAttendance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem("chetu_selected_branch") || "",
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (selectedBranchId) window.localStorage.setItem("chetu_selected_branch", selectedBranchId);
      else window.localStorage.removeItem("chetu_selected_branch");
    }
  }, [selectedBranchId]);

  /**
   * Drops every row this context is holding.
   *
   * Sign-out has to leave nothing behind: the next person to use the browser
   * may be a different officer at the same branch, and rows fetched under the
   * previous session were filtered by *their* policies, not the new one's.
   * `settings` is institution-wide and non-sensitive, so it keeps its defaults
   * rather than being blanked into a broken shell.
   */
  const clearLoadedData = () => {
    setBranches([]);
    setClients([]);
    setClientGroups([]);
    setLoanProducts([]);
    setLoanApplications([]);
    setLoans([]);
    setRepayments([]);
    setSavingsAccounts([]);
    setSavingsTransactions([]);
    setGroupAttendance([]);
    setExpenses([]);
    setBankTransactions([]);
    setAuditLogs([]);
    setTransfers([]);
    // `dataVersion` is deliberately NOT bumped here. Screens that fetch for
    // themselves treat it as "re-pull now", and doing that during sign-out
    // sends a fresh round of protected reads from a browser that no longer has
    // a session — the very thing this gate exists to prevent. They unmount as
    // the router redirects to /login, which discards their rows anyway.
  };

  /**
   * Days between the schedule's anchor event and the first instalment.
   *
   * The approved rule: instalment #1 falls on the first group meeting
   * *strictly after* disbursement. No extra week — a Thursday group whose loan
   * goes out on Friday repays at the following Thursday's meeting, six days
   * later, not thirteen.
   *
   * This replaces a flat seven days, which was a historical implementation
   * mistake rather than a policy: `calculateLoanSchedule` hardcoded
   * `addDays(startDate, 7)` from before meeting days were read at all, and the
   * constant survived the move to meeting-day scheduling. The two rules agree
   * only when disbursement lands on the group's own meeting day, which is why
   * it went unnoticed. Chetu's own receipts settle it — of the eleven
   * collected before the audit, ten fell on the first meeting after
   * disbursement and none on the seven-day date.
   *
   * `loan_products.grace_period_weeks` now drives this, via `graceDaysFor`:
   * 0 (the live product's value) means no additional week, and each further
   * week adds seven days. It was previously read by no calculation anywhere.
   */
  const graceDaysForProduct = (product?: { grace_period_weeks?: number | null }) =>
    graceDaysFor(product?.grace_period_weeks);

  const refetch = async (options?: { silent?: boolean }) => {
    if (!isSupabaseConfigured) return;

    // Asked directly by the header's Refresh, by the 30s poll and by every
    // mutation. None of them can read these tables without a session, so the
    // check lives here rather than being repeated — and remembered — at each
    // call site. Read from the client instead of from React state so a refetch
    // triggered mid sign-out sees the session that actually exists.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    if (!options?.silent) setIsLoading(true);
    const [
      clientsRes,
      groupsRes,
      productsRes,
      appsRes,
      loansRes,
      scheduleRes,
      repaymentsRes,
      savingsRes,
      savingsTxRes,
      attendanceRes,
      expensesRes,
      bankTxRes,
      auditRes,
      settingsRes,
      branchesRes,
      transfersRes,
    ] = await Promise.all([
      // Every table that grows with the portfolio is paged. The row cap is
      // silent — a truncated response carries no error — so a table left
      // unpaged here just loses its tail as the branch takes on members.
      fetchAllRows<Client>(() => supabase.from("clients").select("*").order("id"), "clients"),
      fetchAllRows<ClientGroup>(
        () => supabase.from("client_groups").select("*").order("id"),
        "client_groups",
      ),
      // Loan products and settings are small, bounded reference tables.
      supabase.from("loan_products").select("*"),
      fetchAllRows<LoanApplication>(
        () => supabase.from("loan_applications").select("*").order("id"),
        "loan_applications",
      ),
      fetchAllRows<Loan>(() => supabase.from("loans").select("*").order("id"), "loans"),
      // The biggest table in the system: one row per loan per week. It breaches
      // the cap long before any other, and it did so ordered by `week_number`,
      // which cost every loan its later weeks at once.
      fetchAllRows<WeeklyScheduleRow>(
        () => supabase.from("loan_repayment_schedule").select("*").order("week_number").order("id"),
        "loan_repayment_schedule",
      ),
      fetchAllRows<LoanRepayment>(
        () =>
          supabase
            .from("loan_repayments")
            .select("*")
            .order("payment_date", { ascending: false })
            .order("id"),
        "loan_repayments",
      ),
      fetchAllRows<SavingsAccount>(
        () => supabase.from("savings_accounts").select("*").order("id"),
        "savings_accounts",
      ),
      fetchAllRows<SavingsTransaction>(
        () =>
          supabase
            .from("savings_transactions")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id"),
        "savings_transactions",
      ),
      fetchAllRows<GroupAttendance>(
        () => supabase.from("group_attendance").select("*").order("id"),
        "group_attendance",
      ),
      fetchAllRows<Expense>(() => supabase.from("expenses").select("*").order("id"), "expenses"),
      fetchAllRows<BankTransaction>(
        () => supabase.from("bank_transactions").select("*").order("id"),
        "bank_transactions",
      ),
      // Audit logs grow without bound and nothing reads past the recent ones,
      // so this stays a single capped page on purpose.
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }),
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("branches").select("*").order("branch_name"),
      fetchAllRows<Transfer>(
        () =>
          supabase
            .from("transfers")
            .select("*")
            .order("requested_at", { ascending: false })
            .order("id"),
        "transfers",
      ),
    ]);

    // The Data API returns flat rows; the UI reads nested relations
    // (loan.client, repayment.loan, savings.group, …). Stitch them together
    // here so every screen renders names instead of blanks.
    const clientRows = (clientsRes.data || []) as Client[];
    const groupRows = (groupsRes.data || []) as ClientGroup[];
    const productRows = (productsRes.data || []) as LoanProduct[];
    const scheduleRows = (scheduleRes.data || []) as WeeklyScheduleRow[];

    const clientById = new Map(clientRows.map((c) => [c.id, c]));
    const groupById = new Map(groupRows.map((g) => [g.id, g]));
    const productById = new Map(productRows.map((p) => [p.id, p]));
    const scheduleByLoan = new Map<string, WeeklyScheduleRow[]>();
    scheduleRows.forEach((row) => {
      if (!row.loan_id) return;
      const list = scheduleByLoan.get(row.loan_id) || [];
      list.push(row);
      scheduleByLoan.set(row.loan_id, list);
    });

    const hydratedLoans = ((loansRes.data || []) as Loan[]).map((l) => ({
      ...l,
      client: clientById.get(l.client_id),
      product: productById.get(l.product_id),
      schedule: scheduleByLoan.get(l.id) || [],
    }));
    const loanById = new Map(hydratedLoans.map((l) => [l.id, l]));

    const hydratedApps = ((appsRes.data || []) as LoanApplication[]).map((a) => ({
      ...a,
      client: clientById.get(a.client_id),
      product: productById.get(a.product_id),
    }));

    const hydratedRepayments = ((repaymentsRes.data || []) as LoanRepayment[]).map((r) => ({
      ...r,
      client: clientById.get(r.client_id),
      loan: loanById.get(r.loan_id),
    }));

    const hydratedSavings = ((savingsRes.data || []) as SavingsAccount[]).map((s) => ({
      ...s,
      client: s.client_id ? clientById.get(s.client_id) : undefined,
      group: s.group_id ? groupById.get(s.group_id) : undefined,
    }));
    const savingsById = new Map(hydratedSavings.map((s) => [s.id, s]));

    const hydratedSavingsTx = ((savingsTxRes.data || []) as SavingsTransaction[]).map((t) => ({
      ...t,
      account: savingsById.get(t.account_id),
    }));

    setClients(clientRows);
    setClientGroups(groupRows);
    setLoanProducts(productRows);
    setLoanApplications(hydratedApps);
    setLoans(hydratedLoans);
    setRepayments(hydratedRepayments);
    setSavingsAccounts(hydratedSavings);
    setSavingsTransactions(hydratedSavingsTx);
    if (attendanceRes.data) setGroupAttendance(attendanceRes.data);
    if (expensesRes.data) setExpenses(expensesRes.data);
    if (bankTxRes.data) setBankTransactions(bankTxRes.data);
    if (auditRes.data) setAuditLogs(auditRes.data);
    if (settingsRes.data) setSettings(settingsRes.data as SystemSettings);
    if (branchesRes.data) setBranches(branchesRes.data as Branch[]);
    if (transfersRes.data) setTransfers(transfersRes.data as unknown as Transfer[]);
    // Signals every self-fetching screen to re-pull; see `dataVersion` above.
    setDataVersion((v) => v + 1);
    setIsLoading(false);
  };

  // Every table read below is RLS-protected, so none of them may be attempted
  // until supabase-js has actually restored its session. The client hydrates
  // that asynchronously — `user` comes back from localStorage a whole render
  // earlier — so firing on `user` alone sent sixteen queries as `anon`, took
  // sixteen 401s, and then repeated the whole round once the session landed.
  //
  // Waiting on `isAuthResolved` removes that first round entirely rather than
  // hiding it: the queries are issued once, already carrying the JWT, and the
  // policies decide what comes back exactly as before.
  useEffect(() => {
    if (!isAuthResolved) return;

    // Signed out: nothing here is readable, so nothing is requested. Any rows
    // still held from the previous session are dropped rather than left in
    // memory for whoever signs in next.
    if (!user?.id) {
      clearLoadedData();
      setIsLoading(false);
      return;
    }

    refetch();
  }, [isAuthResolved, user?.id]);

  // Keep the workspace live: quietly re-pull every 30s (no spinner, no reload)
  // while a user is signed in and the tab is visible. Held back until the
  // session is resolved for the same reason as the initial load — a poll that
  // fires first would be another unauthenticated round.
  useEffect(() => {
    if (!isAuthResolved || !user?.id) return;
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refetch({ silent: true });
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthResolved, user?.id]);

  const logAudit = async (action: string, module: string, details: string, record_id?: string) => {
    const insertPayload = {
      user_id: user?.id || undefined,
      user_name: user?.full_name || "System User",
      user_role: role,
      action,
      module,
      record_id: record_id || undefined,
      details,
      ip_address: "127.0.0.1",
      device_info: typeof navigator !== "undefined" ? navigator.userAgent : "Server",
    };
    if (isSupabaseConfigured) {
      // audit_logs only accepts inserts from authenticated users. Events raised
      // before the session exists (e.g. a login attempt) would 403, so keep
      // those in local state instead of hitting the API.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setAuditLogs((prev) => [
          {
            ...insertPayload,
            id: `local-${Date.now()}`,
            created_at: new Date().toISOString(),
          } as unknown as AuditLog,
          ...prev,
        ]);
        return;
      }
      // The profile may not be hydrated yet right after sign-in (the login
      // event is logged before the context catches up), so read the signed-in
      // staff member's name and role straight from the database rather than
      // filing the entry against "System User".
      const sessionUserId = sessionData.session.user.id;
      let actorName = user?.full_name;
      let actorRole = user?.id ? role : undefined;
      if (!user?.id) {
        const { data: actor } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", sessionUserId)
          .maybeSingle();
        if (actor) {
          actorName = actor.full_name;
          actorRole = actor.role;
        }
      }
      const payload = {
        ...insertPayload,
        user_id: user?.id || sessionUserId,
        user_name: actorName || insertPayload.user_name,
        user_role: actorRole || insertPayload.user_role,
      };

      const { data, error } = await supabase.from("audit_logs").insert([payload]).select().single();

      if (!error && data) {
        setAuditLogs((prev) => [data as AuditLog, ...prev]);
      }
    } else {
      // Local fallback with a generated id
      const localLog: AuditLog = {
        ...insertPayload,
        id: `log-${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      setAuditLogs((prev) => [localLog, ...prev]);
    }
  };

  const requireRoles = (allowedRoles: string[]) => {
    if (!user || !allowedRoles.includes(role)) {
      throw new Error("You do not have permission to perform this action");
    }
  };

  // ---------------------------------------------------------------------
  // Branch scoping. Administrators and Auditors see the whole institution;
  // Branch Managers see all records in their assigned branches; Loan
  // Officers see only their own portfolio within those branches.
  // ---------------------------------------------------------------------
  const institutionWide = isAdmin || isAuditor;
  const allowedBranchIds: string[] | null = institutionWide ? null : (user?.branch_ids ?? []);
  const branchMatches = (branchId?: string | null) => {
    if (!branchId) return false;
    if (selectedBranchId && branchId !== selectedBranchId) return false;
    return allowedBranchIds === null || allowedBranchIds.includes(branchId);
  };

  const visibleBranches =
    allowedBranchIds === null ? branches : branches.filter((b) => allowedBranchIds.includes(b.id));
  const visibleBranchIdsKey = visibleBranches.map((branch) => branch.id).join(",");

  useEffect(() => {
    const availableBranchIds = visibleBranchIdsKey.split(",").filter(Boolean);
    if (selectedBranchId && !availableBranchIds.includes(selectedBranchId)) {
      setSelectedBranchId("");
    }
  }, [selectedBranchId, visibleBranchIdsKey]);

  const visibleClients = institutionWide
    ? clients.filter((c) => !selectedBranchId || c.branch_id === selectedBranchId)
    : clients.filter(
        (c) => branchMatches(c.branch_id) && (isBranchManager || c.registered_by === user?.id),
      );

  const visibleGroups = institutionWide
    ? clientGroups.filter((g) => !selectedBranchId || g.branch_id === selectedBranchId)
    : clientGroups.filter(
        (g) =>
          branchMatches(g.branch_id) &&
          (isBranchManager || g.created_by === user?.id || g.loan_officer_id === user?.id),
      );

  const visibleClientIds = new Set(visibleClients.map((c) => c.id));
  const visibleGroupIds = new Set(visibleGroups.map((g) => g.id));

  const visibleApplications = institutionWide
    ? loanApplications.filter((a) => !selectedBranchId || visibleClientIds.has(a.client_id))
    : loanApplications.filter((a) => visibleClientIds.has(a.client_id));
  const visibleLoans = institutionWide
    ? loans.filter((l) => !selectedBranchId || visibleClientIds.has(l.client_id))
    : loans.filter((l) => visibleClientIds.has(l.client_id));
  const visibleRepayments = institutionWide
    ? repayments.filter((r) => !selectedBranchId || visibleClientIds.has(r.client_id))
    : repayments.filter((r) => visibleClientIds.has(r.client_id));
  const visibleSavingsAccounts = institutionWide
    ? savingsAccounts.filter(
        (s) =>
          !selectedBranchId ||
          (s.client_id && visibleClientIds.has(s.client_id)) ||
          (s.group_id && visibleGroupIds.has(s.group_id)),
      )
    : savingsAccounts.filter(
        (s) =>
          (s.client_id && visibleClientIds.has(s.client_id)) ||
          (s.group_id && visibleGroupIds.has(s.group_id)),
      );
  const visibleSavingsAccountIds = new Set(visibleSavingsAccounts.map((s) => s.id));
  const visibleSavingsTransactions = savingsTransactions.filter((t) =>
    visibleSavingsAccountIds.has(t.account_id),
  );
  const visibleAttendance = groupAttendance.filter((a) => visibleGroupIds.has(a.group_id));
  // Financial ledgers carry an optional branch_id. Unassigned legacy entries
  // remain visible only to institution-wide roles rather than leaking across
  // branch boundaries.
  const visibleExpenses = institutionWide
    ? expenses.filter((e) => !selectedBranchId || e.branch_id === selectedBranchId)
    : expenses.filter((e) => branchMatches(e.branch_id));
  const visibleBankTransactions = institutionWide
    ? bankTransactions.filter((t) => !selectedBranchId || t.branch_id === selectedBranchId)
    : bankTransactions.filter((t) => branchMatches(t.branch_id));
  const visibleAuditLogs = institutionWide
    ? auditLogs
    : auditLogs.filter((l) => l.user_id === user?.id);

  const totalDeposits = visibleBankTransactions
    .filter((t) => t.transaction_type === "Deposit")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalWithdrawals = visibleBankTransactions
    .filter((t) => t.transaction_type === "Withdrawal")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpenses = visibleExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalRepaymentsCollected = visibleRepayments.reduce(
    (sum, r) => sum + Number(r.amount_paid),
    0,
  );
  const totalSavingsBalance = visibleSavingsAccounts.reduce((sum, s) => sum + Number(s.balance), 0);

  const currentBankBalance = visibleBankTransactions.reduce(
    (balance, transaction) =>
      balance +
      (transaction.transaction_type === "Deposit"
        ? Number(transaction.amount)
        : -Number(transaction.amount)),
    0,
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const totalCollectionsToday = visibleRepayments
    .filter((r) => r.payment_date === todayStr)
    .reduce((sum, r) => sum + Number(r.amount_paid), 0);

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const totalCollectionsWeekly = visibleRepayments
    .filter((r) => r.payment_date >= sevenDaysAgo)
    .reduce((sum, r) => sum + Number(r.amount_paid), 0);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const totalCollectionsMonthly = visibleRepayments
    .filter((r) => r.payment_date >= thirtyDaysAgo)
    .reduce((sum, r) => sum + Number(r.amount_paid), 0);

  // Empty strings coming out of <select>/<input> fields must become NULL before
  // they reach the database: '' is not a valid uuid/date and, for group_id,
  // trips the clients_group_id_fkey foreign key.
  const nullifyBlanks = <T extends Record<string, unknown>>(row: T): T => {
    const out: Record<string, unknown> = { ...row };
    for (const key of Object.keys(out)) {
      if (out[key] === "") out[key] = null;
    }
    return out as T;
  };

  const addBranch = async (branchData: Omit<Branch, "id" | "created_at">): Promise<Branch> => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const { data, error } = await supabase
      .from("branches")
      .insert([nullifyBlanks({ ...branchData })])
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to create branch");
    const created = data as Branch;
    setBranches((prev) =>
      [...prev, created].sort((a, b) => a.branch_name.localeCompare(b.branch_name)),
    );
    await logAudit(
      "Created Branch",
      "Branch Management",
      `Created branch ${created.branch_name} (${created.branch_code})`,
      created.id,
    );
    await sendNotification({
      title: "Branch created",
      message: `${created.branch_name} (${created.branch_code}) is now available across the system.`,
      type: "System",
      audience: "managers",
      link_url: "/branches",
      excludeId: user?.id,
      includeActor: true,
    });
    return created;
  };

  /**
   * A human-readable "was → now" list for the audit trail. Auditors reviewing a
   * branch change need to see what actually moved, not just that something did.
   */
  const describeBranchChanges = (before: Branch | undefined, after: Partial<Branch>) => {
    if (!before) return "no previous values on record";
    const show = (v: unknown) =>
      v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : String(v);
    const changes = (Object.keys(after) as (keyof Branch)[])
      .filter((key) => key !== "updated_at")
      .filter((key) => show(before[key]) !== show(after[key]))
      .map((key) => `${key}: ${show(before[key])} → ${show(after[key])}`);
    return changes.length ? changes.join("; ") : "no field values changed";
  };

  const updateBranch = async (id: string, branchData: Partial<Branch>) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) return;
    const before = branches.find((b) => b.id === id);
    const { error } = await supabase
      .from("branches")
      .update(nullifyBlanks({ ...branchData, updated_at: new Date().toISOString() }))
      .eq("id", id);
    if (error) throw new Error(error.message);
    setBranches((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...branchData } as Branch) : b)));
    const branchName = branchData.branch_name || before?.branch_name || "A branch";
    await logAudit(
      "Updated Branch",
      "Branch Management",
      `${branchName} — ${describeBranchChanges(before, branchData)}`,
      id,
    );
    await sendNotification({
      title: "Branch updated",
      message: `${branchName} details were changed.`,
      type: "System",
      audience: "managers",
      link_url: `/branches/${id}`,
      excludeId: user?.id,
      includeActor: true,
    });
  };

  /**
   * How much operational history a branch carries. Used to decide whether a
   * branch may be deleted outright or must be deactivated instead.
   */
  const branchLinkedRecordCount = (id: string) =>
    clients.filter((c) => c.branch_id === id).length +
    clientGroups.filter((g) => g.branch_id === id).length +
    expenses.filter((e) => e.branch_id === id).length +
    bankTransactions.filter((t) => t.branch_id === id).length;

  const deactivateBranch = async (id: string, reason: string) => {
    requireRoles(["Administrator"]);
    const trimmed = reason.trim();
    if (!trimmed) throw new Error("A reason is required to deactivate a branch");
    if (!isSupabaseConfigured) return;
    const branchName = branches.find((b) => b.id === id)?.branch_name || "A branch";
    const { error } = await supabase
      .from("branches")
      .update({
        status: "Inactive",
        deactivation_reason: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    setBranches((prev) =>
      prev.map((b) =>
        b.id === id ? ({ ...b, status: "Inactive", deactivation_reason: trimmed } as Branch) : b,
      ),
    );
    await logAudit(
      "Deactivated Branch",
      "Branch Management",
      `${branchName} closed to new operations. Reason: ${trimmed}`,
      id,
    );
    await sendNotification({
      title: "Branch deactivated",
      message: `${branchName} is closed to new operations. Reason: ${trimmed}`,
      type: "System",
      audience: "managers",
      link_url: `/branches/${id}`,
      excludeId: user?.id,
      includeActor: true,
    });
  };

  const reactivateBranch = async (id: string) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) return;
    const branchName = branches.find((b) => b.id === id)?.branch_name || "A branch";
    const { error } = await supabase
      .from("branches")
      .update({ status: "Active", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    setBranches((prev) =>
      prev.map((b) =>
        b.id === id
          ? ({
              ...b,
              status: "Active",
              deactivation_reason: null,
              deactivated_at: null,
              deactivated_by: null,
            } as Branch)
          : b,
      ),
    );
    await logAudit(
      "Reactivated Branch",
      "Branch Management",
      `${branchName} reopened for operations`,
      id,
    );
    await sendNotification({
      title: "Branch reactivated",
      message: `${branchName} is open for operations again.`,
      type: "System",
      audience: "managers",
      link_url: `/branches/${id}`,
      excludeId: user?.id,
      includeActor: true,
    });
  };

  const deleteBranch = async (id: string) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) return;
    // Deleting a branch that carries members, groups or ledger entries would
    // orphan financial history. Those branches are deactivated instead.
    const linked = branchLinkedRecordCount(id);
    if (linked > 0) {
      const branchName = branches.find((b) => b.id === id)?.branch_name || "This branch";
      throw new Error(
        `${branchName} still has ${linked} linked record${linked === 1 ? "" : "s"}. Deactivate it instead of deleting it.`,
      );
    }
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setBranches((prev) => prev.filter((b) => b.id !== id));
    await logAudit("Deleted Branch", "Branch Management", `Removed branch ID ${id}`, id);
    await sendNotification({
      title: "Branch deleted",
      message: "An empty branch record was removed from the system.",
      type: "System",
      audience: "admins",
      link_url: "/branches",
      excludeId: user?.id,
      includeActor: true,
    });
  };

  const addClient = async (
    clientData: Omit<Client, "id" | "client_number" | "created_at" | "approval_status">,
  ): Promise<Client> => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    // Loan Officers submit for Branch Manager review; management admits live.
    const approval_status: Client["approval_status"] =
      role === "Loan Officer" ? "Pending" : "Approved";
    // client_number is generated by the database (trigger) to stay unique across all officers
    const { client_number: _ignored, ...rest } = clientData as any;
    const newClientRow = nullifyBlanks({
      ...rest,
      client_number: "",
      registered_by: user?.id ?? null,
      status: "Active" as const,
      approval_status,
    });
    const { data, error } = await supabase.from("clients").insert([newClientRow]).select().single();
    if (error || !data) throw new Error(error?.message || "Failed to create client");

    const newClient: Client = data as Client;
    setClients((prev) => [newClient, ...prev]);

    // account_number is generated by the database (trigger)
    const savInsertPayload = {
      account_number: "",
      client_id: newClient.id,
      account_type: "Individual" as const,
      balance: 0,
      status: "Active" as const,
    };
    const { data: savData, error: savError } = await supabase
      .from("savings_accounts")
      .insert([savInsertPayload])
      .select()
      .single();
    if (!savError && savData) {
      setSavingsAccounts((prev) => [{ ...savData, client: newClient } as SavingsAccount, ...prev]);
    }

    await logAudit(
      "Client Registration",
      "Client Management",
      `Registered client ${newClient.full_name} (${newClient.client_number}) and created Savings Account (${savData?.account_number || "—"})`,
      newClient.client_number,
    );
    // A member an officer admits needs a manager to pass it, so tell them.
    await sendNotification(
      newClient.approval_status === "Pending"
        ? {
            title: "Member waiting for approval",
            message: `${newClient.full_name} (${newClient.client_number}) was admitted by ${user?.full_name || "an officer"} and needs your approval.`,
            type: "Application",
            link_url: "/member-waiting-approval",
            audience: "managers",
            excludeId: user?.id,
          }
        : {
            title: "New member admitted",
            message: `${newClient.full_name} (${newClient.client_number}) has been admitted.`,
            type: "System",
            link_url: "/member-list",
            audience: "managers",
            excludeId: user?.id,
          },
    );
    return newClient;
  };

  const updateClient = async (id: string, clientData: Partial<Client>) => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("clients")
      .update(nullifyBlanks({ ...clientData, updated_at: new Date().toISOString() }))
      .eq("id", id);
    if (!error) {
      setClients((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, ...clientData, updated_at: new Date().toISOString() } : c,
        ),
      );
    }
    await logAudit(
      "Update Client Profile",
      "Client Management",
      `Updated profile information for client ID ${id}`,
      id,
    );
  };

  const approveClient = async (id: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("clients")
      .update({
        approval_status: "Approved",
        rejection_reason: null,
        reviewed_by: user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    setClients((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              approval_status: "Approved",
              rejection_reason: undefined,
              reviewed_by: user?.id,
              reviewed_at: now,
              updated_at: now,
            }
          : c,
      ),
    );
    const client = clients.find((c) => c.id === id);
    await logAudit(
      "Approved Member",
      "Member Management",
      `Approved member ${client?.full_name || id}`,
      id,
    );
    await sendNotification({
      title: "Member approved",
      message: `${client?.full_name || "Member"} was approved and is now active.`,
      type: "Alert",
      link_url: "/member-list",
      recipientIds: client?.registered_by ? [client.registered_by] : undefined,
      audience: "admins",
      excludeId: user?.id,
    });
  };

  const rejectClient = async (id: string, reason: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("clients")
      .update({
        approval_status: "Rejected",
        rejection_reason: reason,
        reviewed_by: user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    setClients((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              approval_status: "Rejected",
              rejection_reason: reason,
              reviewed_by: user?.id,
              reviewed_at: now,
              updated_at: now,
            }
          : c,
      ),
    );
    const client = clients.find((c) => c.id === id);
    await logAudit(
      "Rejected Member",
      "Member Management",
      `Rejected member ${client?.full_name || id}: ${reason}`,
      id,
    );
    await sendNotification({
      title: "Member rejected",
      message: `${client?.full_name || "Member"} was rejected: ${reason}`,
      type: "Alert",
      link_url: "/member-rejected",
      recipientIds: client?.registered_by ? [client.registered_by] : undefined,
      audience: "admins",
      excludeId: user?.id,
    });
  };

  const declareClientDeath = async (id: string, deathDate: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) return;
    const patch = {
      status: "Inactive" as const,
      inactive_reason: "Deceased",
      inactive_date: deathDate,
      death_date: deathDate,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("clients").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const client = clients.find((c) => c.id === id);
    await logAudit(
      "Declared Member Deceased",
      "Member Management",
      `Recorded death of member ${client?.full_name || id}`,
      id,
    );
    await sendNotification({
      title: "Member recorded deceased",
      message: `${client?.full_name || "A member"} (${client?.client_number || id}) has been recorded as deceased. Any open loan needs settling.`,
      type: "Alert",
      link_url: "/member-death-list",
      audience: "managers",
      recipientIds: client?.loan_officer_id ? [client.loan_officer_id] : undefined,
      excludeId: user?.id,
    });
  };

  const addClientGroup = async (
    groupData: Omit<
      ClientGroup,
      "id" | "group_code" | "member_count" | "created_at" | "approval_status"
    >,
  ): Promise<ClientGroup> => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    // Loan Officers submit for Branch Manager review; management creates live.
    const approval_status: ClientGroup["approval_status"] =
      role === "Loan Officer" ? "Pending" : "Approved";
    // group_code is generated by a database trigger (safe under concurrency / scoped visibility)
    const newGroupRow = nullifyBlanks({
      ...groupData,
      member_count: 0,
      group_savings: 0,
      group_loans: 0,
      approval_status,
      created_by: user?.id,
    });
    const { data, error } = await supabase
      .from("client_groups")
      .insert([newGroupRow])
      .select()
      .single();
    if (error || !data) {
      const details = error?.details ? ` Details: ${error.details}.` : "";
      const hint = error?.hint ? ` Hint: ${error.hint}` : "";
      throw new Error(error?.message || "Failed to create group" + details + hint);
    }
    const newGroup: ClientGroup = { ...data } as ClientGroup;
    setClientGroups((prev) => [newGroup, ...prev]);
    await logAudit(
      "Created Client Group",
      "Client Groups",
      `Created group ${newGroup.group_name} (${newGroup.group_code})`,
      newGroup.group_code,
    );
    await sendNotification(
      newGroup.approval_status === "Pending"
        ? {
            title: "Group waiting for approval",
            message: `${newGroup.group_name} (${newGroup.group_code}) was created by ${user?.full_name || "an officer"} and needs your approval.`,
            type: "Application",
            link_url: "/groups/waiting-approval",
            audience: "managers",
            excludeId: user?.id,
          }
        : {
            title: "New group created",
            message: `${newGroup.group_name} (${newGroup.group_code}) is now active.`,
            type: "System",
            link_url: "/client-groups",
            audience: "managers",
            excludeId: user?.id,
          },
    );
    return newGroup;
  };

  const updateClientGroup = async (id: string, groupData: Partial<ClientGroup>) => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("client_groups")
      .update({ ...groupData, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setClientGroups((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, ...groupData, updated_at: new Date().toISOString() } : g,
        ),
      );
    }
    await logAudit("Updated Client Group", "Client Groups", `Modified group ID ${id}`, id);
  };

  const approveClientGroup = async (id: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("client_groups")
      .update({
        approval_status: "Approved",
        rejection_reason: null,
        reviewed_by: user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    setClientGroups((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              approval_status: "Approved",
              rejection_reason: undefined,
              reviewed_by: user?.id,
              reviewed_at: now,
              updated_at: now,
            }
          : g,
      ),
    );
    const group = clientGroups.find((g) => g.id === id);
    await logAudit(
      "Approved Client Group",
      "Client Groups",
      `Approved group ${group?.group_name || id}`,
      id,
    );
    await sendNotification({
      title: "Group approved",
      message: `Group ${group?.group_name || id} was approved and is now active.`,
      type: "Alert",
      link_url: "/client-groups",
      recipientIds: group?.created_by ? [group.created_by] : undefined,
      audience: "admins",
      excludeId: user?.id,
    });
  };

  const rejectClientGroup = async (id: string, reason: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("client_groups")
      .update({
        approval_status: "Rejected",
        rejection_reason: reason,
        reviewed_by: user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    setClientGroups((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              approval_status: "Rejected",
              rejection_reason: reason,
              reviewed_by: user?.id,
              reviewed_at: now,
              updated_at: now,
            }
          : g,
      ),
    );
    const group = clientGroups.find((g) => g.id === id);
    await logAudit(
      "Rejected Client Group",
      "Client Groups",
      `Rejected group ${group?.group_name || id}: ${reason}`,
      id,
    );
    await sendNotification({
      title: "Group rejected",
      message: `Group ${group?.group_name || id} was rejected: ${reason}`,
      type: "Alert",
      link_url: "/groups/rejected",
      recipientIds: group?.created_by ? [group.created_by] : undefined,
      audience: "admins",
      excludeId: user?.id,
    });
  };

  const deleteClientGroup = async (id: string) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from("client_groups").delete().eq("id", id);
    if (!error) {
      setClientGroups((prev) => prev.filter((g) => g.id !== id));
      setClients((prev) =>
        prev.map((c) => (c.group_id === id ? { ...c, group_id: undefined } : c)),
      );
    }
    await logAudit("Deleted Client Group", "Client Groups", `Removed group ID ${id}`, id);
  };

  const addLoanProduct = async (
    prodData: Omit<LoanProduct, "id" | "created_at">,
  ): Promise<LoanProduct> => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const { data, error } = await supabase
      .from("loan_products")
      .insert([prodData])
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to create product");
    const newProd: LoanProduct = data as LoanProduct;
    setLoanProducts((prev) => [newProd, ...prev]);
    await logAudit(
      "Created Loan Product",
      "Loan Products",
      `Created product ${newProd.product_name} (${newProd.interest_rate}%)`,
      newProd.id,
    );
    return newProd;
  };

  const updateLoanProduct = async (id: string, productData: Partial<LoanProduct>) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from("loan_products").update(productData).eq("id", id);
    if (!error) {
      setLoanProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...productData } : p)));
    }
    await logAudit(
      "Updated Loan Product",
      "Loan Products",
      `Modified product settings for product ID ${id}`,
      id,
    );
  };

  const submitLoanApplication = async (
    appData: Omit<LoanApplication, "id" | "application_number" | "status" | "created_at">,
  ): Promise<LoanApplication> => {
    requireRoles(["Administrator", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    // The database allocates the real number; anything sent here is only a
    // hint and is replaced if it is blank or already taken.

    const clientObj = clients.find((c) => c.id === appData.client_id);
    const prodObj = loanProducts.find((p) => p.id === appData.product_id);

    const newAppRow = {
      ...appData,
      status: "Pending" as const,
      submitted_by: user?.id,
    };
    const { data, error } = await supabase
      .from("loan_applications")
      .insert([newAppRow])
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to submit application");
    const newApp: LoanApplication = {
      ...data,
      client: clientObj,
      product: prodObj,
    } as LoanApplication;
    const application_number = newApp.application_number;
    setLoanApplications((prev) => [newApp, ...prev]);
    await logAudit(
      "Submitted Loan Application",
      "Loan Applications",
      `Submitted application ${application_number} for UGX ${newApp.requested_amount}`,
      application_number,
    );
    await sendNotification({
      title: "New loan application",
      message: `${clientObj?.full_name || "A member"} applied for UGX ${Number(newApp.requested_amount).toLocaleString()} (${application_number}).`,
      type: "Application",
      link_url: "/loan-waiting-approval",
      audience: "managers",
      excludeId: user?.id,
    });
    return newApp;
  };

  const approveLoanApplication = async (appId: string): Promise<Loan> => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const app = loanApplications.find((a) => a.id === appId);
    if (!app) throw new Error("Loan application not found");

    const product = loanProducts.find((p) => p.id === app.product_id);
    if (!product)
      throw new Error(
        "Loan product not found. Please create a loan product before approving applications.",
      );
    const client = clients.find((c) => c.id === app.client_id);

    // Held so the approval can be put back if the loan or its schedule cannot
    // be written. Read before the update, not after.
    const previousApplicationStatus = app.status;
    const previousReviewedBy = app.reviewed_by;

    const { error: appError } = await supabase
      .from("loan_applications")
      .update({ status: "Approved", reviewed_by: user?.id, updated_at: new Date().toISOString() })
      .eq("id", appId);
    if (appError) throw new Error(appError.message);
    setLoanApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: "Approved", reviewed_by: user?.id } : a)),
    );

    // Where the weekly schedule lands.
    //
    // The member's group sets the weekday: a Tuesday group repays on Tuesdays,
    // a Friday group on Fridays, and every instalment is seven days after the
    // one before, so the run keeps its weekday across month and year ends.
    //
    // This used to be `new Date()` — the moment Approve was clicked — and
    // `client_groups.meeting_day` was read nowhere in the loan path at all, so
    // a Tuesday group approved on a Thursday repaid on Thursdays for its whole
    // cycle. The anchor is still the approval date here because the loan has
    // not been disbursed yet; `disburseLoan` rebases the schedule onto the real
    // disbursement date once cash actually goes out, while every row is still
    // unpaid.
    const group = client?.group_id ? clientGroups.find((g) => g.id === client.group_id) : undefined;
    const firstRepayment = resolveFirstRepaymentDate(
      new Date(),
      group?.meeting_day,
      graceDaysForProduct(product),
    );
    if (firstRepayment.usedFallback && group) {
      // The group has no usable meeting day, so the schedule falls back to the
      // approval weekday. Surfaced rather than swallowed: it means this loan
      // will not line up with the group's collection meeting.
      console.warn(
        `Group ${group.group_code} has no recognisable meeting_day (${JSON.stringify(
          group.meeting_day,
        )}); loan schedule falls back to the ${firstRepayment.weekday} anchor weekday.`,
      );
    }

    const calc = calculateLoanSchedule(
      app.requested_amount,
      product.interest_rate,
      product.interest_type,
      app.requested_weeks,
      FEES.processingFeePct,
      new Date(),
      firstRepayment.firstDueDate,
    );

    const approvalFees = loanFees(app.requested_amount);

    // The database allocates the loan number, for the same reason as above.
    const newLoanRow = {
      application_id: app.id,
      client_id: app.client_id,
      product_id: app.product_id,
      principal_amount: app.requested_amount,
      interest_rate: product.interest_rate,
      interest_type: product.interest_type,
      loan_period_weeks: app.requested_weeks,
      total_interest_amount: calc.totalInterestAmount,
      total_amount_payable: calc.totalAmountPayable,
      weekly_installment: calc.weeklyInstallment,
      // Every upfront charge is stored as taken, not recomputed on display, so
      // a later change to the fee schedule cannot rewrite an existing loan.
      processing_fee_amount: approvalFees.processingFee,
      crb_fee_amount: approvalFees.crbFee,
      group_maintenance_fee: approvalFees.groupMaintenanceFee,
      net_disbursed_amount: approvalFees.netDisbursed,
      security_amount: approvalFees.securityDeposit,
      security_balance: approvalFees.securityDeposit,
      first_repayment_date: calc.firstRepaymentDate,
      final_due_date: calc.finalDueDate,
      outstanding_balance: calc.totalAmountPayable,
      completion_percentage: 0.0,
      status: "Pending" as const,
      approved_by: user?.id,
    };
    // The loan and its schedule are written together, or neither survives.
    //
    // The schedule insert used to log its error and let the approval report
    // success, which left an Approved application beside a loan with no
    // schedule: it disburses without the meeting-day rebase, reads as zero
    // arrears forever, and still accepts collections. `persistApprovedLoan`
    // fails the approval instead and undoes what it can — see that module for
    // why a delete is the strongest compensation available here.
    type NewLoanRow = typeof newLoanRow & { id: string; loan_number: string };

    let loanData: NewLoanRow;
    try {
      loanData = await persistApprovedLoan<NewLoanRow>(
        {
          insertLoan: () => supabase.from("loans").insert([newLoanRow]).select().single(),
          insertSchedule: (loan) =>
            supabase.from("loan_repayment_schedule").insert(
              // Schedule generation is unchanged: these are `calc.schedule`
              // rows exactly as before, keyed to the loan just created.
              calc.schedule.map((row) => ({
                loan_id: loan.id,
                week_number: row.week_number,
                due_date: row.due_date,
                installment_amount: row.installment_amount,
                principal_portion: row.principal_portion,
                interest_portion: row.interest_portion,
                paid_amount: row.paid_amount,
                remaining_balance: row.remaining_balance,
                status: row.status as RepaymentStatus,
                paid_at: row.paid_at || null,
              })),
            ),
          deleteLoan: (loan) => supabase.from("loans").delete().eq("id", loan.id),
          restoreApplication: () =>
            supabase
              .from("loan_applications")
              .update({
                status: previousApplicationStatus,
                reviewed_by: previousReviewedBy ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", appId),
        },
        app.application_number,
      );
    } catch (error) {
      // The optimistic update above put the application in Approved locally.
      // The database has been put back (or the error says it has not), so the
      // screen must not keep showing an approval that did not happen.
      setLoanApplications((prev) =>
        prev.map((a) =>
          a.id === appId
            ? { ...a, status: previousApplicationStatus, reviewed_by: previousReviewedBy }
            : a,
        ),
      );
      throw error;
    }

    const loan_number = loanData.loan_number;

    const newLoan: Loan = {
      ...loanData,
      client,
      product,
      schedule: calc.schedule,
    } as Loan;
    setLoans((prev) => [newLoan, ...prev]);
    await logAudit(
      "Approved Loan Application",
      "Loan Approvals",
      `Approved application ${app.application_number} -> Generated Loan ${loan_number}`,
      loan_number,
    );
    await sendNotification({
      title: "Loan application approved",
      message: `Application ${app.application_number} for ${client?.full_name || "a member"} was approved. Loan ${loan_number} is ready for disbursement.`,
      type: "Disbursement",
      link_url: "/loan-waiting-disburse",
      audience: "managers",
      recipientIds: app.submitted_by ? [app.submitted_by] : undefined,
      excludeId: user?.id,
    });
    return newLoan;
  };

  const rejectLoanApplication = async (appId: string, reason: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("loan_applications")
      .update({
        status: "Rejected",
        rejection_reason: reason,
        reviewed_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appId);
    if (!error) {
      setLoanApplications((prev) =>
        prev.map((a) =>
          a.id === appId
            ? { ...a, status: "Rejected", rejection_reason: reason, reviewed_by: user?.id }
            : a,
        ),
      );
    }
    await logAudit(
      "Rejected Loan Application",
      "Loan Approvals",
      `Rejected application ID ${appId}: ${reason}`,
      appId,
    );
    const rejectedApp = loanApplications.find((a) => a.id === appId);
    await sendNotification({
      title: "Loan application rejected",
      message: `Application ${rejectedApp?.application_number || appId} was rejected: ${reason}`,
      type: "Alert",
      link_url: "/loan-applications",
      recipientIds: rejectedApp?.submitted_by ? [rejectedApp.submitted_by] : undefined,
      audience: "admins",
      excludeId: user?.id,
    });
  };

  /**
   * Put a rejected application back in the approval queue. The officer who
   * raised it fixes whatever was wrong and pushes it through again; management
   * may also resubmit on their behalf.
   */
  const resubmitLoanApplication = async (appId: string) => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const app = loanApplications.find((a) => a.id === appId);
    if (!app) throw new Error("Loan application not found");
    if (app.status !== "Rejected")
      throw new Error("Only a rejected application can be resubmitted");
    if (isLoanOfficer && app.submitted_by !== user?.id) {
      throw new Error("You can only resubmit applications you submitted");
    }

    const { error } = await supabase
      .from("loan_applications")
      .update({
        status: "Pending",
        rejection_reason: null,
        reviewed_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appId);
    if (error) throw new Error(error.message);
    setLoanApplications((prev) =>
      prev.map((a) =>
        a.id === appId
          ? { ...a, status: "Pending", rejection_reason: undefined, reviewed_by: undefined }
          : a,
      ),
    );

    await logAudit(
      "Resubmitted Loan Application",
      "Loan Applications",
      `Resubmitted application ${app.application_number} for approval`,
      app.application_number,
    );
    await sendNotification({
      title: "Loan application resubmitted",
      message: `Application ${app.application_number} for ${app.client?.full_name || "a member"} is back in the approval queue.`,
      type: "Application",
      link_url: "/loan-waiting-approval",
      audience: "managers",
      excludeId: user?.id,
    });
  };

  const disburseLoan = async (loanId: string) => {
    requireRoles(["Administrator", "Loan Officer"]);
    if (!isSupabaseConfigured) return;
    const targetLoan = loans.find((l) => l.id === loanId);
    if (!targetLoan) return;

    const now = new Date().toISOString();

    // Re-date the schedule onto the disbursement.
    //
    // The schedule was written at approval, against the approval date, because
    // the disbursement queue needs something to show. Cash can leave days
    // later, so the stored dates can be a week adrift of the repayment the
    // member was actually told about. Re-anchoring here puts the first
    // instalment on the group's first meeting after the money went out.
    //
    // Guarded hard: this only runs while the schedule is untouched. If any row
    // carries a payment, the dates stay exactly as they are — re-dating an
    // instalment a member has already paid against would rewrite history, and
    // a loan cannot be disbursed twice anyway.
    const existingSchedule = targetLoan.schedule || [];
    const scheduleUntouched =
      existingSchedule.length > 0 &&
      existingSchedule.every((row) => Number(row.paid_amount || 0) === 0);
    const disbursementClient = clients.find((c) => c.id === targetLoan.client_id);
    const disbursementGroup = disbursementClient?.group_id
      ? clientGroups.find((g) => g.id === disbursementClient.group_id)
      : undefined;

    let rebasedSchedule: WeeklyScheduleRow[] | null = null;
    let rebasedLoanDates: { first_repayment_date: string; final_due_date: string } | null = null;

    if (scheduleUntouched) {
      const resolved = resolveFirstRepaymentDate(
        now,
        disbursementGroup?.meeting_day,
        graceDaysForProduct(loanProducts.find((p) => p.id === targetLoan.product_id)),
      );
      const dueDates = weeklyDueDates(resolved.firstDueDate, existingSchedule.length);
      const ordered = [...existingSchedule].sort((a, b) => a.week_number - b.week_number);
      // Only the dates move. Amounts, portions and week numbers are untouched:
      // this is not a recalculation of what is owed.
      const candidate = ordered.map((row, i) => ({ ...row, due_date: dueDates[i] }));

      if (candidate.some((row, i) => row.due_date !== ordered[i].due_date)) {
        rebasedSchedule = candidate;
        rebasedLoanDates = {
          first_repayment_date: dueDates[0],
          final_due_date: dueDates[dueDates.length - 1],
        };
      }
    }

    const { error: loanError } = await supabase
      .from("loans")
      .update({
        status: "Active",
        disbursed_by: user?.id,
        disbursed_at: now,
        ...(rebasedLoanDates || {}),
        updated_at: now,
      })
      .eq("id", loanId);
    if (!loanError) {
      setLoans((prev) =>
        prev.map((l) =>
          l.id === loanId
            ? {
                ...l,
                status: "Active",
                disbursed_by: user?.id,
                disbursed_at: now,
                ...(rebasedLoanDates || {}),
                ...(rebasedSchedule ? { schedule: rebasedSchedule } : {}),
              }
            : l,
        ),
      );
    }

    if (!loanError && rebasedSchedule) {
      for (const row of rebasedSchedule) {
        if (!row.id) continue;
        const { error } = await supabase
          .from("loan_repayment_schedule")
          .update({ due_date: row.due_date })
          .eq("id", row.id);
        if (error) console.error("Failed to re-date instalment on disbursement", error);
      }
      await logAudit(
        "Re-dated Repayment Schedule",
        "Loan Disbursement",
        `Schedule for loan ${targetLoan.loan_number} re-anchored to disbursement; first repayment ${rebasedLoanDates?.first_repayment_date} (${disbursementGroup?.meeting_day || "no group meeting day"})`,
        targetLoan.loan_number,
      );
    }

    const { error: appError } = await supabase
      .from("loan_applications")
      .update({ status: "Disbursed", updated_at: now })
      .eq("id", targetLoan.application_id);
    if (!appError) {
      setLoanApplications((prev) =>
        prev.map((a) => (a.id === targetLoan.application_id ? { ...a, status: "Disbursed" } : a)),
      );
    }

    const nextTxSeq = bankTransactions.length + 1;
    const txNum = `CM-TX-2026-${String(nextTxSeq).padStart(4, "0")}`;
    const targetClient = clients.find((client) => client.id === targetLoan.client_id);
    const branchId = targetClient?.branch_id || null;
    const branchLedgerBalance = bankTransactions
      .filter((transaction) => (transaction.branch_id || null) === branchId)
      .reduce(
        (balance, transaction) =>
          balance +
          (transaction.transaction_type === "Deposit"
            ? Number(transaction.amount)
            : -Number(transaction.amount)),
        0,
      );
    // Do NOT include `id` — let DB generate it
    const btInsertPayload = {
      transaction_number: txNum,
      transaction_type: "Withdrawal" as const,
      category: "Loan Disbursement",
      description: `Loan disbursement for ${targetClient?.full_name || "Client"} (Loan ${targetLoan.loan_number})`,
      amount: targetLoan.principal_amount,
      balance_after: branchLedgerBalance - targetLoan.principal_amount,
      reference_number: `STB-DISB-${targetLoan.loan_number}`,
      transaction_date: now.split("T")[0] || "",
      branch_id: branchId,
      recorded_by: user?.id || null,
    };
    const { data: btData, error: txError } = await supabase
      .from("bank_transactions")
      .insert([btInsertPayload])
      .select()
      .single();
    if (!txError && btData) {
      setBankTransactions((prev) => [btData as BankTransaction, ...prev]);
    }
    await logAudit(
      "Disbursed Loan",
      "Loan Disbursement",
      `Disbursed loan ${targetLoan.loan_number} (Net Amount: UGX ${targetLoan.principal_amount})`,
      targetLoan.loan_number,
    );
    await sendNotification({
      title: "Loan disbursed",
      message: `Loan ${targetLoan.loan_number} of UGX ${Number(targetLoan.principal_amount).toLocaleString()} was disbursed to ${targetClient?.full_name || "a member"}.`,
      type: "Disbursement",
      link_url: "/loan-management",
      audience: "managers",
      excludeId: user?.id,
    });
  };

  const recordRepayment = async (
    loanId: string,
    amount: number,
    method: PaymentMethod,
    notes?: string,
  ): Promise<LoanRepayment> => {
    // A Branch Manager runs the branch and covers for absent officers, so they
    // collect too. Settling a loan — a larger cash event — already allowed it.
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const targetLoan = loans.find((l) => l.id === loanId);
    if (!targetLoan) throw new Error("Loan not found");

    const today = new Date().toISOString().split("T")[0];

    // Spread the payment over the outstanding instalments, oldest first — the
    // rule this screen has always applied, now stated once in `allocatePayment`
    // so that recording a receipt, linking it to an instalment and auditing an
    // existing loan cannot drift apart.
    //
    // Ordering by due date rather than by array position matters: a repaired
    // schedule can hold a back-dated instalment inserted after the later weeks,
    // and a missed week must be settled before the current one.
    const { allocations } = allocatePayment(targetLoan.schedule || [], amount);
    const allocationByScheduleId = new Map(
      allocations.filter((a) => a.scheduleId).map((a) => [a.scheduleId as string, a]),
    );

    const updatedSchedule = (targetLoan.schedule || []).map((row) => {
      const allocation = row.id ? allocationByScheduleId.get(row.id) : undefined;
      if (!allocation) return row;
      return {
        ...row,
        paid_amount: allocation.paidAmount,
        remaining_balance: allocation.balance,
        status: allocation.status,
        paid_at: today,
      };
    });

    // Which instalment this receipt is against. The oldest one it touched: a
    // payment that clears three weeks of arrears belongs to the earliest of
    // them, which is what the collection screens and the loan history read it
    // as. `loan_repayments.schedule_id` has existed since the first migration
    // and was never populated, so no receipt could be traced to a week.
    const primaryScheduleId = allocations[0]?.scheduleId ?? null;

    const newOutstanding = Math.max(0, targetLoan.outstanding_balance - amount);
    const completionPct = Math.min(
      100,
      Math.round(
        ((targetLoan.total_amount_payable - newOutstanding) / targetLoan.total_amount_payable) *
          100,
      ),
    );
    const newStatus = newOutstanding === 0 ? "Fully Paid" : "Partially Paid";

    const { error: loanError } = await supabase
      .from("loans")
      .update({
        outstanding_balance: newOutstanding,
        completion_percentage: completionPct,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loanId);
    if (!loanError) {
      setLoans((prev) =>
        prev.map((l) =>
          l.id === loanId
            ? {
                ...l,
                outstanding_balance: newOutstanding,
                completion_percentage: completionPct,
                status: newStatus,
                schedule: updatedSchedule,
              }
            : l,
        ),
      );
    }

    // Do NOT include `id`, `loan`, or `client` — joined fields, not DB columns.
    // The repayment and receipt numbers are left to the database: counting rows
    // in the browser gives every officer the same number, because row level
    // security means each of them only ever sees their own.
    const repInsertPayload = {
      loan_id: loanId,
      schedule_id: primaryScheduleId,
      client_id: targetLoan.client_id,
      amount_paid: amount,
      payment_date: today,
      payment_method: method,
      recorded_by: user?.id || null,
      notes: notes || null,
    };
    const { data: repData, error: repError } = await supabase
      .from("loan_repayments")
      .insert([repInsertPayload])
      .select()
      .single();
    if (repError || !repData)
      throw new Error(repError?.message || "Could not record the repayment");
    const newRepayment: LoanRepayment = {
      ...repData,
      loan: targetLoan,
      client: targetLoan.client,
    } as LoanRepayment;
    const receipt_number = newRepayment.receipt_number;
    setRepayments((prev) => [newRepayment, ...prev]);

    for (const row of updatedSchedule) {
      if (row.id) {
        await supabase
          .from("loan_repayment_schedule")
          .update({
            paid_amount: row.paid_amount,
            remaining_balance: row.remaining_balance,
            status: row.status,
            paid_at: row.paid_at || null,
          })
          .eq("id", row.id);
      }
    }

    await logAudit(
      "Recorded Weekly Repayment",
      "Weekly Repayments",
      `Recorded payment of UGX ${amount} for loan ${targetLoan.loan_number} (Receipt #${receipt_number})`,
      receipt_number,
    );
    await sendNotification({
      title: newStatus === "Fully Paid" ? "Loan fully repaid" : "Repayment received",
      message: `UGX ${Number(amount).toLocaleString()} received on loan ${targetLoan.loan_number} (${targetLoan.client?.full_name || "member"}). Outstanding: UGX ${Number(newOutstanding).toLocaleString()}.`,
      type: "Repayment",
      link_url: "/repayments",
      audience: "managers",
      excludeId: user?.id,
    });
    return newRepayment;
  };

  /**
   * Early settlement. The member clears the whole outstanding balance in one
   * payment, so every remaining schedule row closes at once and the loan moves
   * to the terminal `Settled` state. Any security deposit still held is
   * released back to the member as part of the same transaction.
   */
  const settleLoan = async (
    loanId: string,
    amount: number,
    method: PaymentMethod,
    notes?: string,
  ): Promise<LoanRepayment> => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const targetLoan = loans.find((l) => l.id === loanId);
    if (!targetLoan) throw new Error("Loan not found");
    if (CLOSED_LOAN_STATUSES.includes(targetLoan.status))
      throw new Error("This loan is already closed");
    if (targetLoan.status === "Pending") throw new Error("This loan has not been disbursed yet");
    if (amount <= 0) throw new Error("Enter the settlement amount");

    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();

    const settledSchedule = (targetLoan.schedule || []).map((row) =>
      row.status === "Paid"
        ? row
        : {
            ...row,
            paid_amount: row.installment_amount,
            remaining_balance: 0,
            status: "Paid" as RepaymentStatus,
            paid_at: today,
          },
    );

    const { error: loanError } = await supabase
      .from("loans")
      .update({
        outstanding_balance: 0,
        completion_percentage: 100,
        status: "Settled",
        security_balance: 0,
        settled_at: now,
        settlement_amount: amount,
        settled_by: user?.id || null,
        updated_at: now,
      })
      .eq("id", loanId);
    if (loanError) throw new Error(loanError.message);
    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId
          ? {
              ...l,
              outstanding_balance: 0,
              completion_percentage: 100,
              status: "Settled",
              security_balance: 0,
              settled_at: now,
              settlement_amount: amount,
              settled_by: user?.id,
              schedule: settledSchedule,
            }
          : l,
      ),
    );

    // Numbers come from the database — see recordRepayment for why.
    const repInsertPayload = {
      loan_id: loanId,
      client_id: targetLoan.client_id,
      amount_paid: amount,
      payment_date: today,
      payment_method: method,
      recorded_by: user?.id || null,
      collection_type: "Settlement",
      security_amount: Number(targetLoan.security_balance || 0),
      notes: notes || "Early loan settlement",
    };
    const { data: repData, error: repError } = await supabase
      .from("loan_repayments")
      .insert([repInsertPayload])
      .select()
      .single();
    if (repError || !repData)
      throw new Error(repError?.message || "Failed to record the settlement");
    const newRepayment: LoanRepayment = {
      ...repData,
      loan: targetLoan,
      client: targetLoan.client,
    } as LoanRepayment;
    setRepayments((prev) => [newRepayment, ...prev]);

    for (const row of settledSchedule) {
      if (row.id) {
        await supabase
          .from("loan_repayment_schedule")
          .update({
            paid_amount: row.paid_amount,
            remaining_balance: row.remaining_balance,
            status: row.status,
            paid_at: row.paid_at || null,
          })
          .eq("id", row.id);
      }
    }

    await logAudit(
      "Settled Loan",
      "Loan Settlement",
      `Settled loan ${targetLoan.loan_number} with UGX ${amount} (Receipt #${newRepayment.receipt_number})`,
      newRepayment.receipt_number,
    );
    await sendNotification({
      title: "Loan settled",
      message: `Loan ${targetLoan.loan_number} (${targetLoan.client?.full_name || "member"}) was settled early for UGX ${Number(amount).toLocaleString()}.`,
      type: "Repayment",
      link_url: "/loan-settlement",
      audience: "managers",
      excludeId: user?.id,
    });
    return newRepayment;
  };

  /**
   * Write off an unrecoverable loan. This destroys a receivable, so it is
   * restricted to Administrators and the loan must already have been declared
   * a bad debt on the Bad Loans List.
   */
  const writeOffLoan = async (loanId: string, reason: string) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    if (!reason.trim()) throw new Error("A write-off reason is required");
    const targetLoan = loans.find((l) => l.id === loanId);
    if (!targetLoan) throw new Error("Loan not found");
    if (!targetLoan.is_bad_debt)
      throw new Error("Declare the loan a bad debt before writing it off");
    if (targetLoan.status === "Written Off") throw new Error("This loan is already written off");

    const now = new Date().toISOString();
    const writtenOff = Number(targetLoan.outstanding_balance || 0);

    // The balance moves off the portfolio and is preserved in `writeoff_amount`,
    // so outstanding reports and collection screens stop counting it.
    const { error } = await supabase
      .from("loans")
      .update({
        status: "Written Off",
        writeoff_status: "Written Off",
        writeoff_at: now,
        writeoff_amount: writtenOff,
        writeoff_reason: reason,
        writeoff_by: user?.id || null,
        outstanding_balance: 0,
        updated_at: now,
      })
      .eq("id", loanId);
    if (error) throw new Error(error.message);
    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId
          ? {
              ...l,
              status: "Written Off",
              writeoff_status: "Written Off",
              writeoff_at: now,
              writeoff_amount: writtenOff,
              writeoff_reason: reason,
              writeoff_by: user?.id,
              outstanding_balance: 0,
            }
          : l,
      ),
    );

    await supabase
      .from("bad_loan_comments")
      .insert({ loan_id: loanId, comment: `Written off: ${reason}` });

    await logAudit(
      "Wrote Off Loan",
      "Loan Writeoff",
      `Wrote off loan ${targetLoan.loan_number} (UGX ${writtenOff}): ${reason}`,
      targetLoan.loan_number,
    );
    await sendNotification({
      title: "Loan written off",
      message: `Loan ${targetLoan.loan_number} (${targetLoan.client?.full_name || "member"}) was written off for UGX ${writtenOff.toLocaleString()}.`,
      type: "Alert",
      link_url: "/loan-writeoff",
      audience: "managers",
      excludeId: user?.id,
    });
  };

  /**
   * Roll a disbursement back. Used when cash was never actually handed over or
   * the wrong loan was disbursed: the loan returns to the disbursement queue,
   * the application reverts to Approved and the cash withdrawal is reversed
   * with a matching deposit rather than deleted, so the bank ledger stays
   * append-only.
   */
  const undoDisbursement = async (loanId: string, reason: string) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    if (!reason.trim()) throw new Error("A reason is required");
    const targetLoan = loans.find((l) => l.id === loanId);
    if (!targetLoan) throw new Error("Loan not found");
    if (targetLoan.status !== "Active")
      throw new Error("Only an active, undisbursed-in-error loan can be rolled back");
    if (repayments.some((r) => r.loan_id === loanId)) {
      throw new Error("This loan already has repayments. Undo those first.");
    }

    const now = new Date().toISOString();
    const { error: loanError } = await supabase
      .from("loans")
      .update({
        status: "Pending",
        disbursed_by: null,
        disbursed_at: null,
        updated_at: now,
      })
      .eq("id", loanId);
    if (loanError) throw new Error(loanError.message);
    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId
          ? { ...l, status: "Pending", disbursed_by: undefined, disbursed_at: undefined }
          : l,
      ),
    );

    await supabase
      .from("loan_applications")
      .update({ status: "Approved", updated_at: now })
      .eq("id", targetLoan.application_id);
    setLoanApplications((prev) =>
      prev.map((a) => (a.id === targetLoan.application_id ? { ...a, status: "Approved" } : a)),
    );

    // Contra entry putting the disbursed cash back into the branch ledger.
    const nextTxSeq = bankTransactions.length + 1;
    const txNum = `CM-TX-2026-${String(nextTxSeq).padStart(4, "0")}`;
    const targetClient = clients.find((c) => c.id === targetLoan.client_id);
    const branchId = targetClient?.branch_id || null;
    const branchLedgerBalance = bankTransactions
      .filter((t) => (t.branch_id || null) === branchId)
      .reduce(
        (bal, t) => bal + (t.transaction_type === "Deposit" ? Number(t.amount) : -Number(t.amount)),
        0,
      );
    const { data: btData } = await supabase
      .from("bank_transactions")
      .insert([
        {
          transaction_number: txNum,
          transaction_type: "Deposit" as const,
          category: "Disbursement Reversal",
          description: `Reversal of disbursement for loan ${targetLoan.loan_number}: ${reason}`,
          amount: targetLoan.principal_amount,
          balance_after: branchLedgerBalance + Number(targetLoan.principal_amount),
          reference_number: `STB-REV-${targetLoan.loan_number}`,
          transaction_date: now.split("T")[0] || "",
          branch_id: branchId,
          recorded_by: user?.id || null,
        },
      ])
      .select()
      .single();
    if (btData) setBankTransactions((prev) => [btData as BankTransaction, ...prev]);

    await supabase.from("loan_reversals").insert({
      loan_id: loanId,
      reversal_type: "Disbursement",
      reference_number: targetLoan.loan_number,
      amount: targetLoan.principal_amount,
      reason,
      reversed_by: user?.id || null,
    });

    await logAudit(
      "Undid Loan Disbursement",
      "Loan Rollback",
      `Rolled back disbursement of loan ${targetLoan.loan_number}: ${reason}`,
      targetLoan.loan_number,
    );
    await sendNotification({
      title: "Disbursement rolled back",
      message: `Loan ${targetLoan.loan_number} was returned to the disbursement queue: ${reason}`,
      type: "Alert",
      link_url: "/loan-rollback",
      audience: "managers",
      excludeId: user?.id,
    });
  };

  /**
   * Roll a repayment back. The receipt is deleted, the outstanding balance is
   * restored and the whole schedule is re-applied from the surviving receipts,
   * which keeps the week-by-week allocation correct no matter which receipt
   * was removed.
   */
  const undoRepayment = async (repaymentId: string, reason: string) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    if (!reason.trim()) throw new Error("A reason is required");
    const target = repayments.find((r) => r.id === repaymentId);
    if (!target) throw new Error("Receipt not found");
    const targetLoan = loans.find((l) => l.id === target.loan_id);
    if (!targetLoan) throw new Error("Loan not found");

    const { error: delError } = await supabase
      .from("loan_repayments")
      .delete()
      .eq("id", repaymentId);
    if (delError) throw new Error(delError.message);

    // Re-apply every remaining receipt on this loan from a clean schedule.
    const survivingTotal = repayments
      .filter((r) => r.loan_id === target.loan_id && r.id !== repaymentId)
      .reduce((sum, r) => sum + Number(r.amount_paid), 0);

    let toAllocate = survivingTotal;
    const rebuiltSchedule = (targetLoan.schedule || [])
      .slice()
      .sort((a, b) => a.week_number - b.week_number)
      .map((row) => {
        const due = Number(row.installment_amount);
        if (toAllocate >= due) {
          toAllocate -= due;
          return {
            ...row,
            paid_amount: due,
            remaining_balance: 0,
            status: "Paid" as RepaymentStatus,
          };
        }
        const paid = Math.max(0, toAllocate);
        toAllocate = 0;
        return {
          ...row,
          paid_amount: paid,
          remaining_balance: due - paid,
          status: (paid > 0 ? "Partially Paid" : "Pending") as RepaymentStatus,
          paid_at: paid > 0 ? row.paid_at : undefined,
        };
      });

    const total = Number(targetLoan.total_amount_payable);
    const newOutstanding = Math.max(0, total - survivingTotal);
    const completionPct =
      total > 0 ? Math.min(100, Math.round(((total - newOutstanding) / total) * 100)) : 0;
    const restoredStatus: LoanStatus =
      newOutstanding === 0 ? "Fully Paid" : survivingTotal > 0 ? "Partially Paid" : "Active";

    // Reversing a settlement also has to undo the settlement stamps and give
    // back the security deposit that was released against it.
    const wasSettlement = target.collection_type === "Settlement";
    const settlementUndo = wasSettlement
      ? {
          settled_at: null,
          settlement_amount: null,
          settled_by: null,
          security_balance: Number(target.security_amount || 0),
        }
      : {};

    const now = new Date().toISOString();
    const { error: loanError } = await supabase
      .from("loans")
      .update({
        outstanding_balance: newOutstanding,
        completion_percentage: completionPct,
        status: restoredStatus,
        ...settlementUndo,
        updated_at: now,
      })
      .eq("id", target.loan_id);
    if (loanError) throw new Error(loanError.message);

    for (const row of rebuiltSchedule) {
      if (row.id) {
        await supabase
          .from("loan_repayment_schedule")
          .update({
            paid_amount: row.paid_amount,
            remaining_balance: row.remaining_balance,
            status: row.status,
            paid_at: row.paid_at || null,
          })
          .eq("id", row.id);
      }
    }

    setRepayments((prev) => prev.filter((r) => r.id !== repaymentId));
    setLoans((prev) =>
      prev.map((l) =>
        l.id === target.loan_id
          ? {
              ...l,
              outstanding_balance: newOutstanding,
              completion_percentage: completionPct,
              status: restoredStatus,
              ...(wasSettlement
                ? {
                    settled_at: null,
                    settlement_amount: null,
                    settled_by: null,
                    security_balance: Number(target.security_amount || 0),
                  }
                : {}),
              schedule: rebuiltSchedule,
            }
          : l,
      ),
    );

    await supabase.from("loan_reversals").insert({
      loan_id: target.loan_id,
      reversal_type: target.collection_type === "Settlement" ? "Settlement" : "Repayment",
      reference_number: target.receipt_number,
      amount: target.amount_paid,
      reason,
      reversed_by: user?.id || null,
    });

    await logAudit(
      "Undid Repayment",
      "Loan Rollback",
      `Reversed receipt ${target.receipt_number} of UGX ${target.amount_paid} on loan ${targetLoan.loan_number}: ${reason}`,
      target.receipt_number,
    );
    await sendNotification({
      title: "Repayment reversed",
      message: `Receipt ${target.receipt_number} (UGX ${Number(target.amount_paid).toLocaleString()}) on loan ${targetLoan.loan_number} was reversed: ${reason}`,
      type: "Alert",
      link_url: "/loan-rollback",
      audience: "managers",
      excludeId: user?.id,
    });
  };

  // -------------------------------------------------------------------------
  // Transfers
  // -------------------------------------------------------------------------
  /**
   * Send a member to another branch. The member does not move yet — the
   * receiving branch has to accept first, which is why this only writes the
   * request row.
   */
  const requestMemberTransfer = async (input: {
    clientId: string;
    toBranchId: string;
    toGroupId?: string;
    toOfficerId?: string;
    reason: string;
  }): Promise<Transfer> => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const client = clients.find((c) => c.id === input.clientId);
    if (!client) throw new Error("Member not found");
    if (!input.toBranchId) throw new Error("Choose the receiving branch");
    if (client.branch_id === input.toBranchId)
      throw new Error("The member is already in that branch");
    if (client.approval_status !== "Approved")
      throw new Error("Only an approved member can be transferred");
    if (transfers.some((t) => t.client_id === input.clientId && t.status === "Pending")) {
      throw new Error("This member already has a transfer waiting to be received");
    }

    const { data, error } = await supabase
      .from("transfers")
      .insert([
        {
          transfer_type: "Member Branch",
          client_id: input.clientId,
          from_branch_id: client.branch_id || null,
          to_branch_id: input.toBranchId,
          from_group_id: client.group_id || null,
          to_group_id: input.toGroupId || null,
          from_officer_id: client.loan_officer_id || null,
          to_officer_id: input.toOfficerId || null,
          status: "Pending",
          reason: input.reason,
          requested_by: user?.id || null,
        },
      ])
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Could not raise the transfer");

    const created = data as unknown as Transfer;
    setTransfers((prev) => [created, ...prev]);

    const toBranch = branches.find((b) => b.id === input.toBranchId);
    await logAudit(
      "Requested Member Transfer",
      "Transfers",
      `Requested transfer of ${client.full_name} (${client.client_number}) to ${toBranch?.branch_name || "another branch"}`,
      created.id,
    );
    await sendNotification({
      title: "Member transfer awaiting receipt",
      message: `${client.full_name} (${client.client_number}) has been sent to ${toBranch?.branch_name || "another branch"} and is waiting to be received.`,
      type: "Alert",
      link_url: "/transfers/receive",
      audience: "managers",
      excludeId: user?.id,
    });
    return created;
  };

  /**
   * Accept an incoming member. Runs through a database function because the
   * receiving branch cannot yet see or write the member's row — see the
   * transfers migration for why.
   */
  const receiveMemberTransfer = async (
    transferId: string,
    toGroupId?: string,
    toOfficerId?: string,
  ) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const { error } = await supabase.rpc("receive_member_transfer", {
      _transfer_id: transferId,
      _to_group_id: toGroupId || null,
      _to_officer_id: toOfficerId || null,
    });
    if (error) throw new Error(error.message);

    const transfer = transfers.find((t) => t.id === transferId);
    const client = clients.find((c) => c.id === transfer?.client_id);
    // The member's branch, group and officer all changed server-side, so pull
    // the workspace fresh rather than guessing at the new shape.
    await refetch({ silent: true });

    await logAudit(
      "Received Member Transfer",
      "Transfers",
      `Received ${client?.full_name || "a member"} into this branch`,
      transferId,
    );
    await sendNotification({
      title: "Member transfer received",
      message: `${client?.full_name || "A member"} has been received into ${branches.find((b) => b.id === transfer?.to_branch_id)?.branch_name || "the destination branch"}.`,
      type: "System",
      link_url: "/member-list",
      recipientIds: transfer?.requested_by ? [transfer.requested_by] : undefined,
      audience: "managers",
      excludeId: user?.id,
    });
  };

  const rejectMemberTransfer = async (transferId: string, reason: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    if (!reason.trim()) throw new Error("A reason is required");
    const { error } = await supabase.rpc("reject_member_transfer", {
      _transfer_id: transferId,
      _reason: reason.trim(),
    });
    if (error) throw new Error(error.message);

    const transfer = transfers.find((t) => t.id === transferId);
    const client = clients.find((c) => c.id === transfer?.client_id);
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId
          ? {
              ...t,
              status: "Rejected",
              rejection_reason: reason.trim(),
              actioned_by: user?.id,
              actioned_at: new Date().toISOString(),
            }
          : t,
      ),
    );

    await logAudit(
      "Rejected Member Transfer",
      "Transfers",
      `Rejected transfer of ${client?.full_name || "a member"}: ${reason}`,
      transferId,
    );
    await sendNotification({
      title: "Member transfer rejected",
      message: `The transfer of ${client?.full_name || "a member"} was rejected: ${reason}`,
      type: "Alert",
      link_url: "/transfers/member",
      recipientIds: transfer?.requested_by ? [transfer.requested_by] : undefined,
      audience: "managers",
      excludeId: user?.id,
    });
  };

  /** Withdraw a request the origin branch raised, before it is received. */
  const cancelMemberTransfer = async (transferId: string) => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const transfer = transfers.find((t) => t.id === transferId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "Pending") throw new Error("Only a waiting transfer can be withdrawn");

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("transfers")
      .update({
        status: "Rejected",
        rejection_reason: "Withdrawn by the sending branch",
        actioned_by: user?.id || null,
        actioned_at: now,
      })
      .eq("id", transferId);
    if (error) throw new Error(error.message);

    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId
          ? {
              ...t,
              status: "Rejected",
              rejection_reason: "Withdrawn by the sending branch",
              actioned_by: user?.id,
              actioned_at: now,
            }
          : t,
      ),
    );
    await logAudit(
      "Withdrew Member Transfer",
      "Transfers",
      `Withdrew transfer ${transferId}`,
      transferId,
    );
    await sendNotification({
      title: "Member transfer withdrawn",
      message: `The transfer of ${clients.find((c) => c.id === transfer.client_id)?.full_name || "a member"} was withdrawn by the sending branch.`,
      type: "Alert",
      link_url: "/transfers/receive",
      audience: "managers",
      excludeId: user?.id,
    });
  };

  /** Move a member into another group inside the same branch. */
  const transferMemberGroup = async (clientId: string, toGroupId: string, reason?: string) => {
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const { error } = await supabase.rpc("transfer_member_group", {
      _client_id: clientId,
      _to_group_id: toGroupId,
      _reason: reason || null,
    });
    if (error) throw new Error(error.message);

    const client = clients.find((c) => c.id === clientId);
    const group = clientGroups.find((g) => g.id === toGroupId);
    await refetch({ silent: true });
    await logAudit(
      "Interchanged Member Group",
      "Transfers",
      `Moved ${client?.full_name || "a member"} into group ${group?.group_name || toGroupId}`,
      clientId,
    );
    await sendNotification({
      title: "Member moved between groups",
      message: `${client?.full_name || "A member"} now belongs to ${group?.group_name || "another group"}.`,
      type: "System",
      link_url: "/member-list",
      audience: "managers",
      recipientIds: group?.loan_officer_id ? [group.loan_officer_id] : undefined,
      excludeId: user?.id,
    });
  };

  /** Reassign a group and everyone in it to a different loan officer. */
  const transferGroupOfficer = async (groupId: string, toOfficerId: string, reason?: string) => {
    requireRoles(["Administrator", "Branch Manager"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const { error } = await supabase.rpc("transfer_group_officer", {
      _group_id: groupId,
      _to_officer_id: toOfficerId,
      _reason: reason || null,
    });
    if (error) throw new Error(error.message);

    const group = clientGroups.find((g) => g.id === groupId);
    await refetch({ silent: true });
    await logAudit(
      "Transferred Group Officer",
      "Transfers",
      `Reassigned group ${group?.group_name || groupId} to a new loan officer`,
      groupId,
    );
    await sendNotification({
      title: "Group reassigned",
      message: `Group ${group?.group_name || groupId} and its members have been reassigned to a new loan officer.`,
      type: "System",
      link_url: "/client-groups",
      recipientIds: toOfficerId ? [toOfficerId] : undefined,
      audience: "managers",
      excludeId: user?.id,
    });
  };

  const addSavingsTransaction = async (
    accountId: string,
    amount: number,
    type: SavingsTransactionType,
    method: PaymentMethod,
    notes?: string,
  ): Promise<SavingsTransaction> => {
    // A Branch Manager takes deposits over the counter too.
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const acc = savingsAccounts.find((a) => a.id === accountId);
    if (!acc) throw new Error("Savings account not found");

    const nextSeq = savingsTransactions.length + 1;
    const txNum = `CM-STX-2026-${String(nextSeq).padStart(4, "0")}`;
    const recNum = `CM-SREC-2026-${String(nextSeq).padStart(4, "0")}`;

    const newBalance =
      type === "Withdrawal" ? Math.max(0, acc.balance - amount) : acc.balance + amount;

    const { error: accError } = await supabase
      .from("savings_accounts")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", accountId);
    if (!accError) {
      setSavingsAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? { ...a, balance: newBalance, updated_at: new Date().toISOString() }
            : a,
        ),
      );
    }

    // Do NOT include `id` or `account` join — let DB generate id
    const stxInsertPayload = {
      transaction_number: txNum,
      account_id: accountId,
      transaction_type: type,
      amount,
      balance_after: newBalance,
      payment_method: method,
      recorded_by: user?.id || null,
      receipt_number: recNum,
      notes: notes || null,
    };
    const { data: stxData, error: txError } = await supabase
      .from("savings_transactions")
      .insert([stxInsertPayload])
      .select()
      .single();
    const newTx: SavingsTransaction = stxData
      ? ({ ...stxData, account: acc } as SavingsTransaction)
      : ({
          ...stxInsertPayload,
          id: `stx-${Date.now()}`,
          created_at: new Date().toISOString(),
          account: acc,
        } as SavingsTransaction);
    if (!txError) {
      setSavingsTransactions((prev) => [newTx, ...prev]);
    }
    await logAudit(
      `Recorded Savings ${type}`,
      "Savings Management",
      `Recorded ${type} of UGX ${amount} for Account ${acc.account_number} (Receipt #${recNum})`,
      recNum,
    );
    return newTx;
  };

  const recordGroupAttendance = async (
    groupId: string,
    meetingDate: string,
    attendees: string[],
    notes?: string,
  ): Promise<GroupAttendance> => {
    // A Branch Manager sitting in on a group meeting records it.
    requireRoles(["Administrator", "Branch Manager", "Loan Officer"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const newAtt: GroupAttendance = {
      id: `att-${Date.now()}`,
      group_id: groupId,
      meeting_date: meetingDate,
      attendees,
      notes,
      recorded_by: user?.id,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("group_attendance").insert([newAtt]);
    if (!error) {
      setGroupAttendance((prev) => [newAtt, ...prev]);
    }
    await logAudit(
      "Recorded Group Attendance",
      "Client Groups",
      `Recorded attendance for Group ID ${groupId} on ${meetingDate} (${attendees.length} members present)`,
      groupId,
    );
    return newAtt;
  };

  const addExpense = async (
    expData: Omit<Expense, "id" | "expense_number" | "created_at">,
  ): Promise<Expense> => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const nextSeq = expenses.length + 1;
    const expense_number = `CM-EXP-2026-${String(nextSeq).padStart(4, "0")}`;
    const newExpRow = {
      ...expData,
      expense_number,
      recorded_by: user?.id,
    };
    const { data, error } = await supabase.from("expenses").insert([newExpRow]).select().single();
    if (error || !data) throw new Error(error?.message || "Failed to create expense");
    const newExp: Expense = {
      ...data,
      expense_number: data.expense_number || expense_number,
    } as Expense;
    setExpenses((prev) => [newExp, ...prev]);
    await logAudit(
      "Recorded Expense",
      "Expense Management",
      `Logged expense ${expense_number} (${newExp.category} - UGX ${newExp.amount})`,
      expense_number,
    );
    await sendNotification({
      title: "Expense recorded",
      message: `${expense_number} — ${newExp.category}, UGX ${Number(newExp.amount).toLocaleString()}.`,
      type: "System",
      audience: "managers",
      link_url: "/expenses",
      excludeId: user?.id,
      includeActor: true,
    });
    return newExp;
  };

  const addBankTransaction = async (
    txData: Omit<BankTransaction, "id" | "transaction_number" | "balance_after" | "created_at">,
  ): Promise<BankTransaction> => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) throw new Error("Database not configured");
    const nextSeq = bankTransactions.length + 1;
    const transaction_number = `CM-TX-2026-${String(nextSeq).padStart(4, "0")}`;
    const ledgerBranchId = txData.branch_id || "";
    const branchLedgerBalance = bankTransactions
      .filter((transaction) => (transaction.branch_id || "") === ledgerBranchId)
      .reduce(
        (balance, transaction) =>
          balance +
          (transaction.transaction_type === "Deposit"
            ? Number(transaction.amount)
            : -Number(transaction.amount)),
        0,
      );
    const balance_after =
      txData.transaction_type === "Deposit"
        ? branchLedgerBalance + Number(txData.amount)
        : branchLedgerBalance - Number(txData.amount);

    const newTxRow = {
      ...txData,
      transaction_number,
      balance_after,
      recorded_by: user?.id,
    };
    const { data, error } = await supabase
      .from("bank_transactions")
      .insert([newTxRow])
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to create transaction");
    const newTx: BankTransaction = {
      ...data,
      transaction_number: data.transaction_number || transaction_number,
    } as BankTransaction;
    setBankTransactions((prev) => [newTx, ...prev]);
    await logAudit(
      `Recorded Bank ${txData.transaction_type}`,
      "Bank Management",
      `${txData.transaction_type} of UGX ${txData.amount} (${txData.category})`,
      transaction_number,
    );
    await sendNotification({
      title: `Bank ${txData.transaction_type.toLowerCase()} posted`,
      message: `${transaction_number} — ${txData.category}, UGX ${Number(txData.amount).toLocaleString()}. Closing balance UGX ${Number(balance_after).toLocaleString()}.`,
      type: "System",
      audience: "managers",
      link_url: "/bank-management",
      excludeId: user?.id,
      includeActor: true,
    });
    return newTx;
  };

  const updateSettings = async (newSettings: Partial<SystemSettings>) => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from("settings")
      .update({ ...newSettings, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (!error) {
      setSettings((prev) => ({ ...prev, ...newSettings, updated_at: new Date().toISOString() }));
    }
    await logAudit(
      "Updated System Settings",
      "Settings",
      "Modified global system configurations and parameters.",
    );
  };

  const clearAllData = async () => {
    requireRoles(["Administrator"]);
    if (!isSupabaseConfigured) return;
    // Delete in dependency order (children before parents)
    // NOTE: 'guarantors' table does not exist — data is stored as columns in loan_applications
    await supabase.from("audit_logs").delete().neq("id", "none");
    await supabase.from("bank_transactions").delete().neq("id", "none");
    await supabase.from("expenses").delete().neq("id", "none");
    await supabase.from("savings_transactions").delete().neq("id", "none");
    await supabase.from("savings_accounts").delete().neq("id", "none");
    await supabase.from("loan_repayments").delete().neq("id", "none");
    await supabase.from("loan_repayment_schedule").delete().neq("id", "none");
    await supabase.from("loans").delete().neq("id", "none");
    await supabase.from("loan_applications").delete().neq("id", "none");
    await supabase.from("loan_products").delete().neq("id", "none");
    await supabase.from("group_attendance").delete().neq("id", "none");
    await supabase.from("group_members").delete().neq("id", "none");
    await supabase.from("clients").delete().neq("id", "none");
    await supabase.from("client_groups").delete().neq("id", "none");
    await supabase
      .from("settings")
      .update({
        company_name: "Chetu Microfinance Ltd",
        default_currency: "UGX",
        default_interest_rate: 15.0,
        default_processing_fee: 2.0,
        receipt_footer: defaultSettings.receipt_footer,
        report_header: defaultSettings.report_header,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setClients([]);
    setClientGroups([]);
    setLoanProducts([]);
    setLoanApplications([]);
    setLoans([]);
    setRepayments([]);
    setSavingsAccounts([]);
    setSavingsTransactions([]);
    setGroupAttendance([]);
    setExpenses([]);
    setBankTransactions([]);
    setAuditLogs([]);
    setSettings(defaultSettings);
  };

  const performGlobalSearch = (query: string): GlobalSearchResult[] => {
    if (!query || query.trim().length === 0) return [];
    const q = query.toLowerCase().trim();
    const results: GlobalSearchResult[] = [];

    visibleClients.forEach((c) => {
      if (
        c.full_name.toLowerCase().includes(q) ||
        c.client_number.toLowerCase().includes(q) ||
        c.phone_number.includes(q) ||
        c.nin.toLowerCase().includes(q)
      ) {
        results.push({
          type: "Client",
          id: c.id,
          title: c.full_name,
          subtitle: `${c.client_number} | ${c.phone_number} | ${c.nin}`,
          link: `/clients`,
        });
      }
    });

    visibleLoans.forEach((l) => {
      if (
        l.loan_number.toLowerCase().includes(q) ||
        l.client?.full_name.toLowerCase().includes(q)
      ) {
        results.push({
          type: "Loan",
          id: l.id,
          title: `Loan ${l.loan_number}`,
          subtitle: `${l.client?.full_name || "Client"} - UGX ${l.principal_amount.toLocaleString()} (${l.status})`,
          link: `/repayments`,
        });
      }
    });

    visibleGroups.forEach((g) => {
      if (g.group_name.toLowerCase().includes(q) || g.group_code.toLowerCase().includes(q)) {
        results.push({
          type: "Group",
          id: g.id,
          title: g.group_name,
          subtitle: `${g.group_code} | ${g.branch} | ${g.member_count} Members`,
          link: `/client-groups`,
        });
      }
    });

    visibleSavingsAccounts.forEach((s) => {
      if (
        s.account_number.toLowerCase().includes(q) ||
        s.client?.full_name.toLowerCase().includes(q)
      ) {
        results.push({
          type: "Savings",
          id: s.id,
          title: `Account ${s.account_number}`,
          subtitle: `Balance: UGX ${s.balance.toLocaleString()} (${s.account_type})`,
          link: `/savings`,
        });
      }
    });

    loanProducts.forEach((p) => {
      if (p.product_name.toLowerCase().includes(q)) {
        results.push({
          type: "Product",
          id: p.id,
          title: p.product_name,
          subtitle: `${p.interest_rate}% Interest (${p.interest_type})`,
          link: `/loan-products`,
        });
      }
    });

    return results.slice(0, 10);
  };

  return (
    <DatabaseContext.Provider
      value={{
        branches: visibleBranches,
        clients: visibleClients,
        clientGroups: visibleGroups,
        loanProducts,
        loanApplications: visibleApplications,
        loans: visibleLoans,
        repayments: visibleRepayments,
        savingsAccounts: visibleSavingsAccounts,
        savingsTransactions: visibleSavingsTransactions,
        groupAttendance: visibleAttendance,
        expenses: visibleExpenses,
        bankTransactions: visibleBankTransactions,
        auditLogs: visibleAuditLogs,
        transfers,
        settings,
        isLoading,
        selectedBranchId,
        setSelectedBranchId,
        currentBankBalance,
        totalDeposits,
        totalWithdrawals,
        totalCollectionsToday,
        totalCollectionsWeekly,
        totalCollectionsMonthly,
        totalExpenses,
        totalSavingsBalance,
        addBranch,
        updateBranch,
        deleteBranch,
        deactivateBranch,
        reactivateBranch,
        branchLinkedRecordCount,
        addClient,
        updateClient,
        approveClient,
        rejectClient,
        declareClientDeath,
        addClientGroup,
        updateClientGroup,
        deleteClientGroup,
        approveClientGroup,
        rejectClientGroup,
        addLoanProduct,
        updateLoanProduct,
        submitLoanApplication,
        approveLoanApplication,
        rejectLoanApplication,
        resubmitLoanApplication,
        disburseLoan,
        recordRepayment,
        settleLoan,
        writeOffLoan,
        undoDisbursement,
        undoRepayment,
        requestMemberTransfer,
        receiveMemberTransfer,
        rejectMemberTransfer,
        cancelMemberTransfer,
        transferMemberGroup,
        transferGroupOfficer,
        addSavingsTransaction,
        recordGroupAttendance,
        addExpense,
        addBankTransaction,
        updateSettings,
        performGlobalSearch,
        logAudit,
        clearAllData,
        refetch,
        dataVersion,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) throw new Error("useDatabase must be used within DatabaseProvider");
  return context;
};
