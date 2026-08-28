import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { GroupCreate } from "@/pages/GroupCreate";

export const Route = createFileRoute("/group-create")({
  head: () => ({
    meta: [
      { title: "Group Create | Chetu Microfinance" },
      {
        name: "description",
        content:
          "Register a new peer lending group with its executive committee and weekly meeting schedule.",
      },
      { property: "og:title", content: "Group Create | Chetu Microfinance" },
      {
        property: "og:description",
        content:
          "Register a new peer lending group with its executive committee and weekly meeting schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <GroupCreate />
    </ProtectedLayout>
  ),
});
