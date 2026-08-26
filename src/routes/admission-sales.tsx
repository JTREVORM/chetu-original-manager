import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { AdmissionSales } from "@/pages/AdmissionSales";

export const Route = createFileRoute("/admission-sales")({
  head: () => ({
    meta: [
      { title: "Admission & Passbook Sale | Chetu Microfinance" },
      { name: "description", content: "Track admission, passbook and CRB fees collected from new members." },
      { property: "og:title", content: "Admission & Passbook Sale | Chetu Microfinance" },
      { property: "og:description", content: "Track admission, passbook and CRB fees collected from new members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <AdmissionSales />
    </ProtectedLayout>
  ),
});
