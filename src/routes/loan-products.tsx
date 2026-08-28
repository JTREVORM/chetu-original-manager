import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { LoanProducts } from "@/pages/LoanProducts";

export const Route = createFileRoute("/loan-products")({
  head: () => ({
    meta: [
      { title: "Loan Products | Chetu Microfinance" },
      {
        name: "description",
        content: "Loan Products workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Loan Products | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Loan Products workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <LoanProducts />
    </ProtectedLayout>
  ),
});
