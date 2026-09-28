import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanPortfolioReport } from "@/pages/reports/LoanPortfolioReport";

export const Route = createFileRoute("/reports/loan-portfolio")({
  head: () => ({
    meta: [
      { title: "Loan Portfolio | Chetu Microfinance" },
      {
        name: "description",
        content: "Every loan with principal and interest outstanding kept apart.",
      },
      { property: "og:title", content: "Loan Portfolio | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Every loan with principal and interest outstanding kept apart.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanPortfolioReport />
    </ProtectedLayout>
  ),
});
