import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BranchFinancialReport } from "@/pages/reports/LedgerReports";

export const Route = createFileRoute("/reports/branch-financials")({
  head: () => ({
    meta: [
      { title: "Branch Report | Chetu Microfinance" },
      {
        name: "description",
        content: "Liquidity, disbursements, collections, arrears, income and expenses per branch.",
      },
      { property: "og:title", content: "Branch Report | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Liquidity, disbursements, collections, arrears, income and expenses per branch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <BranchFinancialReport />
    </ProtectedLayout>
  ),
});
