import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { CollectionsReport } from "@/pages/reports/CollectionsReport";

export const Route = createFileRoute("/reports/collections")({
  head: () => ({
    meta: [
      { title: "Collections | Chetu Microfinance" },
      {
        name: "description",
        content: "Expected against actual, split into principal, interest and penalties.",
      },
      { property: "og:title", content: "Collections | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Expected against actual, split into principal, interest and penalties.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <CollectionsReport />
    </ProtectedLayout>
  ),
});
