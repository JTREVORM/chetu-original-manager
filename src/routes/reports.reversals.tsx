import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ReversalRegister } from "@/pages/reports/ReversalRegister";

export const Route = createFileRoute("/reports/reversals")({
  head: () => ({
    meta: [
      { title: "Reversal Register | Chetu Microfinance" },
      { name: "description", content: "Every disbursement and receipt an Administrator has rolled back." },
      { property: "og:title", content: "Reversal Register | Chetu Microfinance" },
      { property: "og:description", content: "Every disbursement and receipt an Administrator has rolled back." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <ReversalRegister />
    </ProtectedLayout>
  ),
});
