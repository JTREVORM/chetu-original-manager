import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanOfficerReport } from "@/pages/reports/LedgerReports";

export const Route = createFileRoute("/reports/loan-officer")({
  head: () => ({
    meta: [
      { title: "Loan Officer Report | Chetu Microfinance" },
      {
        name: "description",
        content: "Portfolio, disbursements, collections and arrears by officer.",
      },
      { property: "og:title", content: "Loan Officer Report | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Portfolio, disbursements, collections and arrears by officer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanOfficerReport />
    </ProtectedLayout>
  ),
});
