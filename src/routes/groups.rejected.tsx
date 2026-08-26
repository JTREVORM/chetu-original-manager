import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { GroupRejectedList } from "@/pages/GroupRejectedList";

export const Route = createFileRoute("/groups/rejected")({
  head: () => ({
    meta: [
      { title: "Group Rejected List | Chetu Microfinance" },
      { name: "description", content: "Groups rejected during Branch Manager approval." },
      { property: "og:title", content: "Group Rejected List | Chetu Microfinance" },
      { property: "og:description", content: "Groups rejected during Branch Manager approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <GroupRejectedList />
    </ProtectedLayout>
  ),
});
