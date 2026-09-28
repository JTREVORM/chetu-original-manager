import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { AccountLedgerReport } from "@/pages/reports/LedgerReports";

export const Route = createFileRoute("/reports/account-ledger")({
  head: () => ({
    meta: [
      { title: "Account Ledger | Chetu Microfinance" },
      { name: "description", content: "Every posting against an account, with a running balance." },
      { property: "og:title", content: "Account Ledger | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Every posting against an account, with a running balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <AccountLedgerReport />
    </ProtectedLayout>
  ),
});
