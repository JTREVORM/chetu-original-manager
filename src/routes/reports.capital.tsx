import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { CapitalFundingReport } from "@/pages/reports/IncomeExpenseReports";

export const Route = createFileRoute("/reports/capital")({
  head: () => ({
    meta: [
      { title: "Capital & Funding | Chetu Microfinance" },
      {
        name: "description",
        content: "Capital introduced and withdrawn, with its destination account.",
      },
      { property: "og:title", content: "Capital & Funding | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Capital introduced and withdrawn, with its destination account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <CapitalFundingReport />
    </ProtectedLayout>
  ),
});
