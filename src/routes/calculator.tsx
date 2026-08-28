import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanCalculator } from "@/pages/LoanCalculator";

export const Route = createFileRoute("/calculator")({
  head: () => ({
    meta: [
      { title: "Loan Calculator | Chetu Microfinance" },
      {
        name: "description",
        content: "Loan Calculator workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Loan Calculator | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Loan Calculator workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanCalculator />
    </ProtectedLayout>
  ),
});
