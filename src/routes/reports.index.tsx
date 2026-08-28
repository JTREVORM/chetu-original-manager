import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ReportsIndex } from "@/pages/reports/ReportsIndex";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Reports | Chetu Microfinance" },
      {
        name: "description",
        content: "Reports workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Reports | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Reports workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <ReportsIndex />
    </ProtectedLayout>
  ),
});
