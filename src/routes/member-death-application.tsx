import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberDeathApplication } from "@/pages/MemberDeathList";

export const Route = createFileRoute("/member-death-application")({
  head: () => ({
    meta: [
      { title: "Member Death Application | Chetu Microfinance" },
      { name: "description", content: "Declare an active member deceased and move them to the death list." },
      { property: "og:title", content: "Member Death Application | Chetu Microfinance" },
      { property: "og:description", content: "Declare an active member deceased and move them to the death list." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberDeathApplication />
    </ProtectedLayout>
  ),
});
