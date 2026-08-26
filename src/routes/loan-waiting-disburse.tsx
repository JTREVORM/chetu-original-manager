import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanWaitingDisburse } from "@/pages/LoanWaitingDisburse";

export const Route = createFileRoute("/loan-waiting-disburse")({
  head: () => ({
    meta: [
      { title: "Waiting for Disburse | Chetu Microfinance" },
      { name: "description", content: "Approved loans whose cash has not yet been released." },
      { property: "og:title", content: "Waiting for Disburse | Chetu Microfinance" },
      { property: "og:description", content: "Approved loans whose cash has not yet been released." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanWaitingDisburse />
    </ProtectedLayout>
  ),
});
