import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { DailyOverdueReport } from "@/pages/reports/DailyOverdueReport";

export const Route = createFileRoute("/reports/daily-overdue")({
  head: () => ({
    meta: [
      { title: "Daily Overdue Report | Chetu Microfinance" },
      { name: "description", content: "Daily overdue report for loans behind on instalments." },
      { property: "og:title", content: "Daily Overdue Report | Chetu Microfinance" },
      { property: "og:description", content: "Daily overdue report for loans behind on instalments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <DailyOverdueReport />
    </ProtectedLayout>
  ),
});
