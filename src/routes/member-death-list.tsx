import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberDeathList } from "@/pages/MemberDeathList";

export const Route = createFileRoute("/member-death-list")({
  head: () => ({
    meta: [
      { title: "Member Death List | Chetu Microfinance" },
      { name: "description", content: "Members recorded as deceased." },
      { property: "og:title", content: "Member Death List | Chetu Microfinance" },
      { property: "og:description", content: "Members recorded as deceased." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberDeathList />
    </ProtectedLayout>
  ),
});
