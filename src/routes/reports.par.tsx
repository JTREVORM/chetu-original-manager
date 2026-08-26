import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { PortfolioAtRisk } from "@/pages/reports/PortfolioAtRisk";

export const Route = createFileRoute("/reports/par")({
  head: () => ({
    meta: [
      { title: "Portfolio at Risk | Chetu Microfinance" },
      { name: "description", content: "Arrears ageing buckets and the PAR ratio across the portfolio." },
      { property: "og:title", content: "Portfolio at Risk | Chetu Microfinance" },
      { property: "og:description", content: "Arrears ageing buckets and the PAR ratio across the portfolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <PortfolioAtRisk />
    </ProtectedLayout>
  ),
});
