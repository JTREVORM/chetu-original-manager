import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { OutstandingReport } from "@/pages/reports/OutstandingReport";

export const Route = createFileRoute("/reports/outstanding")({
  head: () => ({
    meta: [
      { title: "Outstanding Report | Chetu Microfinance" },
      { name: "description", content: "Outstanding report for active loan balances." },
      { property: "og:title", content: "Outstanding Report | Chetu Microfinance" },
      { property: "og:description", content: "Outstanding report for active loan balances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <OutstandingReport />
    </ProtectedLayout>
  ),
});
