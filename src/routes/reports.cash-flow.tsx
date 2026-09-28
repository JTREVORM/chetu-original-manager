import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { CashFlowReport } from "@/pages/reports/CashFlowReport";

export const Route = createFileRoute("/reports/cash-flow")({
  head: () => ({
    meta: [
      { title: "Cash Flow | Chetu Microfinance" },
      {
        name: "description",
        content: "Money in and out by category, with internal transfers shown separately.",
      },
      { property: "og:title", content: "Cash Flow | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Money in and out by category, with internal transfers shown separately.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <CashFlowReport />
    </ProtectedLayout>
  ),
});
