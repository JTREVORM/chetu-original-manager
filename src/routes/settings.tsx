import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Settings } from "@/pages/Settings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Chetu Microfinance" },
      { name: "description", content: "Settings workspace in the Chetu microfinance management system." },
      { property: "og:title", content: "Settings | Chetu Microfinance" },
      { property: "og:description", content: "Settings workspace in the Chetu microfinance management system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout adminOnly>
      <Settings />
    </ProtectedLayout>
  ),
});
