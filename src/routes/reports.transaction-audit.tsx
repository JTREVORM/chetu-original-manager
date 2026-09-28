import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { TransactionAuditReport } from "@/pages/reports/LedgerReports";

export const Route = createFileRoute("/reports/transaction-audit")({
  head: () => ({
    meta: [
      { title: "Transaction Audit | Chetu Microfinance" },
      {
        name: "description",
        content:
          "Every financial transaction with its accounts, user, timestamp and reversal history.",
      },
      { property: "og:title", content: "Transaction Audit | Chetu Microfinance" },
      {
        property: "og:description",
        content:
          "Every financial transaction with its accounts, user, timestamp and reversal history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <TransactionAuditReport />
    </ProtectedLayout>
  ),
});
