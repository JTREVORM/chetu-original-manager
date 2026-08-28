import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Clients } from "@/pages/Clients";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients | Chetu Microfinance" },
      {
        name: "description",
        content: "Clients workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Clients | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Clients workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <Clients />
    </ProtectedLayout>
  ),
});
