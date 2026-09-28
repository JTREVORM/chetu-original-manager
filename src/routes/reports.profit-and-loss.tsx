import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ProfitAndLossReport } from "@/pages/reports/IncomeExpenseReports";

export const Route = createFileRoute("/reports/profit-and-loss")({
  head: () => ({
    meta: [
      { title: "Profit & Loss | Chetu Microfinance" },
      {
        name: "description",
        content: "Income less operating expenses. Loan principal is excluded by construction.",
      },
      { property: "og:title", content: "Profit & Loss | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Income less operating expenses. Loan principal is excluded by construction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <ProfitAndLossReport />
    </ProtectedLayout>
  ),
});
