import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberList } from "@/pages/MemberList";

export const Route = createFileRoute("/member-list")({
  head: () => ({
    meta: [
      { title: "Member List | Chetu Microfinance" },
      {
        name: "description",
        content: "Search, review and manage active members across branches and groups.",
      },
      { property: "og:title", content: "Member List | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Search, review and manage active members across branches and groups.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberList />
    </ProtectedLayout>
  ),
});
