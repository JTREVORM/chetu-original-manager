import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BadLoansList } from "@/pages/BadLoansList";

export const Route = createFileRoute("/bad-loans")({
  head: () => ({
    meta: [
      { title: "Bad Loans List | Chetu Microfinance" },
      { name: "description", content: "Age overdue loans, add review comments and declare bad debts." },
      { property: "og:title", content: "Bad Loans List | Chetu Microfinance" },
      { property: "og:description", content: "Age overdue loans, add review comments and declare bad debts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <BadLoansList />
    </ProtectedLayout>
  ),
});
