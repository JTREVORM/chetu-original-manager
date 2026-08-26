import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanSecurityReturnList } from "@/pages/LoanSecurityReturnList";

export const Route = createFileRoute("/security-returns")({
  head: () => ({
    meta: [
      { title: "Loan Security Return List | Chetu Microfinance" },
      { name: "description", content: "Track and release loan security balances back to members." },
      { property: "og:title", content: "Loan Security Return List | Chetu Microfinance" },
      { property: "og:description", content: "Track and release loan security balances back to members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanSecurityReturnList />
    </ProtectedLayout>
  ),
});
