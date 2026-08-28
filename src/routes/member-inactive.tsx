import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberInactiveList } from "@/pages/MemberInactiveList";

export const Route = createFileRoute("/member-inactive")({
  head: () => ({
    meta: [
      { title: "Member Inactive List | Chetu Microfinance" },
      {
        name: "description",
        content: "Review inactive members and re-admit them into an active group.",
      },
      { property: "og:title", content: "Member Inactive List | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Review inactive members and re-admit them into an active group.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberInactiveList />
    </ProtectedLayout>
  ),
});
