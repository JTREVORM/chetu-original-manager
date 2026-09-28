import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BankManagement } from "@/pages/BankManagement";

export const Route = createFileRoute("/bank-management")({
  head: () => ({
    meta: [
      { title: "Legacy Bank Register | Chetu Microfinance" },
      {
        name: "description",
        content: "The superseded single-account bank register, kept read-only for reference.",
      },
      { property: "og:title", content: "Legacy Bank Register | Chetu Microfinance" },
      {
        property: "og:description",
        content: "The superseded single-account bank register, kept read-only for reference.",
      },
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
