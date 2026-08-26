import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoWiseGroupRealizable } from "@/pages/reports/LoWiseGroupRealizable";

export const Route = createFileRoute("/reports/lo-wise-group-realizable")({
  head: () => ({
    meta: [
      { title: "LO Wise Group Realizable | Chetu Microfinance" },
      { name: "description", content: "Loan officer wise group realizable report." },
      { property: "og:title", content: "LO Wise Group Realizable | Chetu Microfinance" },
      { property: "og:description", content: "Loan officer wise group realizable report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoWiseGroupRealizable />
    </ProtectedLayout>
  ),
});
