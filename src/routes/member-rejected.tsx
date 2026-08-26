import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberRejected } from "@/pages/MemberRejected";

export const Route = createFileRoute("/member-rejected")({
  head: () => ({
    meta: [
      { title: "Member Rejected | Chetu Microfinance" },
      { name: "description", content: "Member admissions rejected during Branch Manager approval." },
      { property: "og:title", content: "Member Rejected | Chetu Microfinance" },
      { property: "og:description", content: "Member admissions rejected during Branch Manager approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberRejected />
    </ProtectedLayout>
  ),
});
