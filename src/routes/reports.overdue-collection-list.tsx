import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { OverdueCollectionList } from "@/pages/reports/OverdueCollectionList";

export const Route = createFileRoute("/reports/overdue-collection-list")({
  head: () => ({
    meta: [
      { title: "Overdue Collection List | Chetu Microfinance" },
      { name: "description", content: "Overdue collection list report for arrears follow-up." },
      { property: "og:title", content: "Overdue Collection List | Chetu Microfinance" },
      { property: "og:description", content: "Overdue collection list report for arrears follow-up." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <OverdueCollectionList />
    </ProtectedLayout>
  ),
});
