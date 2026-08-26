import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Dashboard } from "@/pages/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Chetu Microfinance" },
      {
        name: "description",
        content:
          "Portfolio, loans, savings and repayment overview for the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Dashboard | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Portfolio, loans, savings and repayment overview for Chetu microfinance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <Dashboard />
    </ProtectedLayout>
  ),
});
