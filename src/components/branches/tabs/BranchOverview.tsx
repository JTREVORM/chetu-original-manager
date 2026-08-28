/**
 * Today's trading, then the standing position, then the trends behind both.
 */
import React, { useMemo } from "react";
import { ArrowDownCircle, ArrowUpCircle, Banknote, PiggyBank } from "lucide-react";
import { branchTrend, changeVs } from "../../../lib/branchMetrics";
import { money } from "../../mis/MisKit";
import { compactUGX, Delta, Panel, parTone, percent, StatTile } from "../BranchUi";
import {
  CollectionsVsDueChart,
  MovementChart,
  ProductDonut,
  SavingsMovementChart,
} from "../BranchCharts";
import type { BranchTabProps } from "./shared";

const TodayCard: React.FC<{
  label: string;
  value: number;
  previous: number;
  icon: React.ElementType;
  tone: string;
}> = ({ label, value, previous, icon: Icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <div className="flex items-center gap-2">
      <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
    <p className="mt-2 text-lg font-bold text-slate-900">UGX {money(value)}</p>
    <div className="mt-1">
      <Delta value={changeVs(value, previous)} />
    </div>
  </div>
);

export const BranchOverview: React.FC<BranchTabProps> = ({ slice, metrics, branchStaff }) => {
  const trend = useMemo(() => branchTrend(slice, 30), [slice]);
  const fortnight = useMemo(() => trend.slice(-14), [trend]);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-[13px] font-bold text-slate-900">Today’s Performance</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TodayCard
            label="Collections"
            value={metrics.collections.today}
            previous={metrics.collections.yesterday}
            icon={Banknote}
            tone="bg-emerald-50 text-emerald-600"
          />
          <TodayCard
            label="Disbursements"
            value={metrics.disbursements.today}
            previous={metrics.disbursements.yesterday}
            icon={ArrowUpCircle}
            tone="bg-blue-50 text-[#0B4394]"
          />
          <TodayCard
            label="Savings Deposits"
            value={metrics.savings.depositsToday}
            previous={metrics.savings.depositsYesterday}
            icon={PiggyBank}
            tone="bg-blue-50 text-[#0B4394]"
          />
          <TodayCard
            label="Savings Withdrawals"
            value={metrics.savings.withdrawalsToday}
            previous={metrics.savings.withdrawalsYesterday}
            icon={ArrowDownCircle}
            tone="bg-amber-50 text-amber-600"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Branch Portfolio"
          subtitle="Position as it stands now"
          className="xl:col-span-1"
        >
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Active members"
              value={money(metrics.members.active)}
              hint={`${money(metrics.members.total)} on file`}
            />
            <StatTile
              label="Active groups"
              value={money(metrics.groups.active)}
              hint={`${money(metrics.groups.total)} on file`}
            />
            <StatTile
              label="Active loans"
              value={money(metrics.loans.active)}
              hint={`${money(metrics.loans.overdue)} in arrears`}
            />
            <StatTile
              label="Staff"
              value={money(branchStaff.length)}
              hint="assigned to this branch"
            />
            <StatTile
              label="Outstanding portfolio"
              value={compactUGX(metrics.portfolio.outstanding)}
              hint={`UGX ${money(metrics.portfolio.outstanding)}`}
            />
            <StatTile
              label="PAR 30"
              value={percent(metrics.portfolio.par30Ratio)}
              tone={parTone(metrics.portfolio.par30Ratio)}
              hint={`UGX ${money(metrics.portfolio.par30Amount)} at risk`}
            />
            <StatTile
              label="Savings held"
              value={compactUGX(metrics.savings.balance)}
              hint={`${money(metrics.savings.accounts)} accounts`}
            />
            <StatTile
              label="Arrears"
              value={compactUGX(metrics.portfolio.arrears)}
              tone={metrics.portfolio.arrears > 0 ? "text-amber-600" : "text-slate-900"}
              hint="overdue instalments"
            />
          </div>
        </Panel>

        <Panel
          title="Portfolio Movement"
          subtitle="Collections against disbursements, last 30 days"
          className="xl:col-span-2"
        >
          <MovementChart data={trend} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Loan Portfolio by Product" subtitle="Share of the outstanding balance">
          <ProductDonut data={metrics.portfolio.byProduct} />
        </Panel>
        <Panel
          title="Collections vs Due"
          subtitle="Instalments falling due against what was received, last 14 days"
        >
          <CollectionsVsDueChart data={fortnight} />
        </Panel>
        <Panel
          title="Savings Movement"
          subtitle="Deposits against withdrawals, last 30 days"
          className="xl:col-span-2"
        >
          <SavingsMovementChart data={trend} />
        </Panel>
      </div>
    </div>
  );
};
