import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanApplications } from "@/pages/LoanApplications";

export const Route = createFileRoute("/loan-applications")({
  head: () => ({
    meta: [
      { title: "Loan Applications | Chetu Microfinance" },
      {
        name: "description",
        content: "Loan Applications workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Loan Applications | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Loan Applications workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanApplications />
    </ProtectedLayout>
  ),
});
