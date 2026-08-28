import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { AuditLogs } from "@/pages/AuditLogs";

export const Route = createFileRoute("/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs | Chetu Microfinance" },
      {
        name: "description",
        content: "Audit Logs workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Audit Logs | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Audit Logs workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout adminOnly>
      <AuditLogs />
    </ProtectedLayout>
  ),
});
