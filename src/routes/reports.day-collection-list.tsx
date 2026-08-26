import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { DayCollectionList } from "@/pages/reports/DayCollectionList";

export const Route = createFileRoute("/reports/day-collection-list")({
  head: () => ({
    meta: [
      { title: "Day Collection List | Chetu Microfinance" },
      { name: "description", content: "Day collection list report of repayments captured per day." },
      { property: "og:title", content: "Day Collection List | Chetu Microfinance" },
      { property: "og:description", content: "Day collection list report of repayments captured per day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <DayCollectionList />
    </ProtectedLayout>
  ),
});
