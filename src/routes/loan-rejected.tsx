import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanRejectedList } from "@/pages/LoanRejectedList";

export const Route = createFileRoute("/loan-rejected")({
  head: () => ({
    meta: [
      { title: "Loan Rejected List | Chetu Microfinance" },
      { name: "description", content: "Loan applications that were rejected, with resubmission for the submitting officer." },
      { property: "og:title", content: "Loan Rejected List | Chetu Microfinance" },
      { property: "og:description", content: "Loan applications that were rejected, with resubmission for the submitting officer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanRejectedList />
    </ProtectedLayout>
  ),
});
