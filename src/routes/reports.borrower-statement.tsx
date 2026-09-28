import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BorrowerStatementReport } from "@/pages/reports/LedgerReports";

export const Route = createFileRoute("/reports/borrower-statement")({
  head: () => ({
    meta: [
      { title: "Borrower Statement | Chetu Microfinance" },
      { name: "description", content: "A member's complete loan, payment and balance history." },
      { property: "og:title", content: "Borrower Statement | Chetu Microfinance" },
      {
        property: "og:description",
        content: "A member's complete loan, payment and balance history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <BorrowerStatementReport />
    </ProtectedLayout>
  ),
});
