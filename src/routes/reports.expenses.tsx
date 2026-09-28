import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ExpenseReport } from "@/pages/reports/IncomeExpenseReports";

export const Route = createFileRoute("/reports/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses | Chetu Microfinance" },
      {
        name: "description",
        content: "Operating expenses by category, branch and the account that paid them.",
      },
      { property: "og:title", content: "Expenses | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Operating expenses by category, branch and the account that paid them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <ExpenseReport />
    </ProtectedLayout>
  ),
});
