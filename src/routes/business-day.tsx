import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BusinessDayControl } from "@/pages/BusinessDayControl";

export const Route = createFileRoute("/business-day")({
  head: () => ({
    meta: [
      { title: "Business Day | Chetu Microfinance" },
      {
        name: "description",
        content: "Open, close and approve the working day for each branch and loan officer.",
      },
      { property: "og:title", content: "Business Day | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Open, close and approve the working day for each branch and loan officer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <BusinessDayControl />
    </ProtectedLayout>
  ),
});
