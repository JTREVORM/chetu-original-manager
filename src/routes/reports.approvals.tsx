import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ApprovalPipeline } from "@/pages/reports/ApprovalPipeline";

export const Route = createFileRoute("/reports/approvals")({
  head: () => ({
    meta: [
      { title: "Approval Pipeline | Chetu Microfinance" },
      { name: "description", content: "Groups, members and loan applications waiting on a decision or rejected." },
      { property: "og:title", content: "Approval Pipeline | Chetu Microfinance" },
      { property: "og:description", content: "Groups, members and loan applications waiting on a decision or rejected." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <ApprovalPipeline />
    </ProtectedLayout>
  ),
});
