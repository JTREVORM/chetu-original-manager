import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { AuditDashboard } from "@/pages/AuditDashboard";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Dashboard | Chetu Microfinance" },
      {
        name: "description",
        content: "Audit Dashboard workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Audit Dashboard | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Audit Dashboard workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout adminOnly>
      <AuditDashboard />
    </ProtectedLayout>
  ),
});
