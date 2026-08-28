import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { OverdueCollection } from "@/pages/Collections";

export const Route = createFileRoute("/overdue-collection")({
  head: () => ({
    meta: [
      { title: "Overdue Collection | Chetu Microfinance" },
      {
        name: "description",
        content: "Collect arrears from members whose weekly loan instalments are behind.",
      },
      { property: "og:title", content: "Overdue Collection | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Collect arrears from members whose weekly loan instalments are behind.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <OverdueCollection />
    </ProtectedLayout>
  ),
});
