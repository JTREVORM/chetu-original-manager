import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { GroupWaitingApproval } from "@/pages/GroupWaitingApproval";

export const Route = createFileRoute("/groups/waiting-approval")({
  head: () => ({
    meta: [
      { title: "Waiting for Approval Group | Chetu Microfinance" },
      { name: "description", content: "Groups awaiting Branch Manager approval before they can operate." },
      { property: "og:title", content: "Waiting for Approval Group | Chetu Microfinance" },
      { property: "og:description", content: "Groups awaiting Branch Manager approval before they can operate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <GroupWaitingApproval />
    </ProtectedLayout>
  ),
});
