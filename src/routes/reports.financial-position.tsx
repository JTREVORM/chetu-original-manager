import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { FinancialPositionReport } from "@/pages/reports/FinancialPosition";

export const Route = createFileRoute("/reports/financial-position")({
  head: () => ({
    meta: [
      { title: "Financial Position | Chetu Microfinance" },
      {
        name: "description",
        content: "Liquidity, receivables, liabilities and capital, derived from posted journals.",
      },
      { property: "og:title", content: "Financial Position | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Liquidity, receivables, liabilities and capital, derived from posted journals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <FinancialPositionReport />
    </ProtectedLayout>
  ),
});
