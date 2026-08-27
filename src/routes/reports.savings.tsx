import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { SavingsReport } from "@/pages/reports/SavingsReport";

export const Route = createFileRoute("/reports/savings")({
  head: () => ({
    meta: [
      { title: "Savings Report | Chetu Microfinance" },
      { name: "description", content: "Savings deposits and withdrawals per member, group, branch and loan officer." },
      { property: "og:title", content: "Savings Report | Chetu Microfinance" },
      { property: "og:description", content: "Savings deposits and withdrawals per member, group, branch and loan officer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <SavingsReport />
    </ProtectedLayout>
  ),
});
