import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanWriteoff } from "@/pages/LoanWriteoff";

export const Route = createFileRoute("/loan-writeoff")({
  head: () => ({
    meta: [
      { title: "Loan Writeoff | Chetu Microfinance" },
      { name: "description", content: "Write off loans already declared bad debts that cannot be recovered." },
      { property: "og:title", content: "Loan Writeoff | Chetu Microfinance" },
      { property: "og:description", content: "Write off loans already declared bad debts that cannot be recovered." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanWriteoff />
    </ProtectedLayout>
  ),
});
