import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ReceiveMember } from "@/pages/transfers/ReceiveMember";

export const Route = createFileRoute("/transfers/receive")({
  head: () => ({
    meta: [
      { title: "Receive Member | Chetu Microfinance" },
      { name: "description", content: "Accept or reject members transferred in from another branch." },
      { property: "og:title", content: "Receive Member | Chetu Microfinance" },
      { property: "og:description", content: "Accept or reject members transferred in from another branch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <ReceiveMember />
    </ProtectedLayout>
  ),
});
