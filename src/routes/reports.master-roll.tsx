import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MasterRoll } from "@/pages/reports/MasterRoll";

export const Route = createFileRoute("/reports/master-roll")({
  head: () => ({
    meta: [
      { title: "Master Roll | Chetu Microfinance" },
      { name: "description", content: "Master roll report for branch loan and member records." },
      { property: "og:title", content: "Master Roll | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Master roll report for branch loan and member records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MasterRoll />
    </ProtectedLayout>
  ),
});
