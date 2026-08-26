import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { GroupInterchange } from "@/pages/transfers/GroupInterchange";

export const Route = createFileRoute("/transfers/group-interchange")({
  head: () => ({
    meta: [
      { title: "Group Interchange | Chetu Microfinance" },
      { name: "description", content: "Move a member into a different group within the same branch." },
      { property: "og:title", content: "Group Interchange | Chetu Microfinance" },
      { property: "og:description", content: "Move a member into a different group within the same branch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <GroupInterchange />
    </ProtectedLayout>
  ),
});
