import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Repayments } from "@/pages/Repayments";

export const Route = createFileRoute("/repayments")({
  head: () => ({
    meta: [
      { title: "Repayments | Chetu Microfinance" },
      {
        name: "description",
        content: "Repayments workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Repayments | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Repayments workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <Repayments />
    </ProtectedLayout>
  ),
});
