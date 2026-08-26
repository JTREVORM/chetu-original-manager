import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { GroupWiseCollection } from "@/pages/Collections";

export const Route = createFileRoute("/group-collection")({
  head: () => ({
    meta: [
      { title: "Group Wise Collection | Chetu Microfinance" },
      { name: "description", content: "Record weekly group repayments for every member of a lending group." },
      { property: "og:title", content: "Group Wise Collection | Chetu Microfinance" },
      { property: "og:description", content: "Record weekly group repayments for every member of a lending group." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <GroupWiseCollection />
    </ProtectedLayout>
  ),
});
