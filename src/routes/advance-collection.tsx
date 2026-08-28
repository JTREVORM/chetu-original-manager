import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { AdvanceCollection } from "@/pages/Collections";

export const Route = createFileRoute("/advance-collection")({
  head: () => ({
    meta: [
      { title: "Advance Collection | Chetu Microfinance" },
      {
        name: "description",
        content: "Record advance loan repayments made ahead of the weekly schedule.",
      },
      { property: "og:title", content: "Advance Collection | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Record advance loan repayments made ahead of the weekly schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <AdvanceCollection />
    </ProtectedLayout>
  ),
});
