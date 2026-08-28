import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { SavingsDashboardPage } from "@/pages/Savings";

export const Route = createFileRoute("/savings")({
  head: () => ({
    meta: [
      { title: "Savings Dashboard | Chetu Microfinance" },
      { name: "description", content: "Weekly savings monitoring across branches and groups." },
      { property: "og:title", content: "Savings Dashboard | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Weekly savings monitoring across branches and groups.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <SavingsDashboardPage />
    </ProtectedLayout>
  ),
});
