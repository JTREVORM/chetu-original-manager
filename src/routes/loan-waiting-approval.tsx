import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanWaitingApproval } from "@/pages/LoanWaitingApproval";

export const Route = createFileRoute("/loan-waiting-approval")({
  head: () => ({
    meta: [
      { title: "Waiting for Approval | Chetu Microfinance" },
      { name: "description", content: "Loan applications awaiting a Branch Manager decision." },
      { property: "og:title", content: "Waiting for Approval | Chetu Microfinance" },
      { property: "og:description", content: "Loan applications awaiting a Branch Manager decision." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanWaitingApproval />
    </ProtectedLayout>
  ),
});
