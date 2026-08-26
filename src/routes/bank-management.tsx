import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BankManagement } from "@/pages/BankManagement";

export const Route = createFileRoute("/bank-management")({
  head: () => ({
    meta: [
      { title: "Bank Management | Chetu Microfinance" },
      { name: "description", content: "Bank Management workspace in the Chetu microfinance management system." },
      { property: "og:title", content: "Bank Management | Chetu Microfinance" },
      { property: "og:description", content: "Bank Management workspace in the Chetu microfinance management system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <BankManagement />
    </ProtectedLayout>
  ),
});
