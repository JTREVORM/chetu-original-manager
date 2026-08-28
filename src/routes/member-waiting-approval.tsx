import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberWaitingApproval } from "@/pages/MemberWaitingApproval";

export const Route = createFileRoute("/member-waiting-approval")({
  head: () => ({
    meta: [
      { title: "Waiting for Approval Member | Chetu Microfinance" },
      {
        name: "description",
        content: "Members awaiting Branch Manager approval before admission is confirmed.",
      },
      { property: "og:title", content: "Waiting for Approval Member | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Members awaiting Branch Manager approval before admission is confirmed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberWaitingApproval />
    </ProtectedLayout>
  ),
});
