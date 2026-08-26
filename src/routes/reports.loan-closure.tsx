import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanClosureReport } from "@/pages/reports/LoanClosureReport";

export const Route = createFileRoute("/reports/loan-closure")({
  head: () => ({
    meta: [
      { title: "Loan Closure Report | Chetu Microfinance" },
      { name: "description", content: "Loans repaid, settled early or written off in a period." },
      { property: "og:title", content: "Loan Closure Report | Chetu Microfinance" },
      { property: "og:description", content: "Loans repaid, settled early or written off in a period." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanClosureReport />
    </ProtectedLayout>
  ),
});
