import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ArrearsAgeing } from "@/pages/reports/ArrearsAgeing";

export const Route = createFileRoute("/reports/arrears")({
  head: () => ({
    meta: [
      { title: "Arrears & Portfolio at Risk | Chetu Microfinance" },
      { name: "description", content: "Arrears aged 1-7, 8-30, 31-60, 61-90 and 90+ days." },
      { property: "og:title", content: "Arrears & Portfolio at Risk | Chetu Microfinance" },
      { property: "og:description", content: "Arrears aged 1-7, 8-30, 31-60, 61-90 and 90+ days." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <ArrearsAgeing />
    </ProtectedLayout>
  ),
});
