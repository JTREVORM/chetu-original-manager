import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { FeeCollectionReport } from "@/pages/reports/FeeCollectionReport";

export const Route = createFileRoute("/reports/fee-collection")({
  head: () => ({
    meta: [
      { title: "Fee Collection Report | Chetu Microfinance" },
      { name: "description", content: "Admission, passbook, processing, CRB, security and group maintenance charges collected." },
      { property: "og:title", content: "Fee Collection Report | Chetu Microfinance" },
      { property: "og:description", content: "Admission, passbook, processing, CRB, security and group maintenance charges collected." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <FeeCollectionReport />
    </ProtectedLayout>
  ),
});
