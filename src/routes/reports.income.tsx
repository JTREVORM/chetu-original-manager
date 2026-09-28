import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { IncomeReport } from "@/pages/reports/IncomeExpenseReports";

export const Route = createFileRoute("/reports/income")({
  head: () => ({
    meta: [
      { title: "Income | Chetu Microfinance" },
      { name: "description", content: "Interest, fees and penalties recognised as collected." },
      { property: "og:title", content: "Income | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Interest, fees and penalties recognised as collected.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <IncomeReport />
    </ProtectedLayout>
  ),
});
