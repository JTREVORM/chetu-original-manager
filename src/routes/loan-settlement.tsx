import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanSettlement } from "@/pages/LoanSettlement";

export const Route = createFileRoute("/loan-settlement")({
  head: () => ({
    meta: [
      { title: "Loan Settlement | Chetu Microfinance" },
      {
        name: "description",
        content: "Close a loan early by settling the whole outstanding balance in one payment.",
      },
      { property: "og:title", content: "Loan Settlement | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Close a loan early by settling the whole outstanding balance in one payment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanSettlement />
    </ProtectedLayout>
  ),
});
