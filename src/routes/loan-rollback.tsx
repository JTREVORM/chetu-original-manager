import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanRollback } from "@/pages/LoanRollback";

export const Route = createFileRoute("/loan-rollback")({
  head: () => ({
    meta: [
      { title: "Loan Rollback | Chetu Microfinance" },
      {
        name: "description",
        content: "Undo a disbursement or reverse a repayment receipt entered in error.",
      },
      { property: "og:title", content: "Loan Rollback | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Undo a disbursement or reverse a repayment receipt entered in error.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanRollback />
    </ProtectedLayout>
  ),
});
