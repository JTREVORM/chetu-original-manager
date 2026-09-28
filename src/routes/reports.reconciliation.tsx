import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ReconciliationReport } from "@/pages/reports/LedgerReports";

export const Route = createFileRoute("/reports/reconciliation")({
  head: () => ({
    meta: [
      { title: "Cash & Bank Reconciliation | Chetu Microfinance" },
      {
        name: "description",
        content: "System balance against the counted balance, and any unresolved difference.",
      },
      { property: "og:title", content: "Cash & Bank Reconciliation | Chetu Microfinance" },
      {
        property: "og:description",
        content: "System balance against the counted balance, and any unresolved difference.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <ReconciliationReport />
    </ProtectedLayout>
  ),
});
