import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { FinancialLedger } from "@/pages/financial/FinancialLedger";

export const Route = createFileRoute("/financial-ledger")({
  head: () => ({
    meta: [
      { title: "Financial Ledger | Chetu Microfinance" },
      {
        name: "description",
        content: "Accounts, cash, journals and reconciliation for Chetu Microfinance.",
      },
      { property: "og:title", content: "Financial Ledger | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Accounts, cash, journals and reconciliation for Chetu Microfinance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <FinancialLedger />
    </ProtectedLayout>
  ),
});
