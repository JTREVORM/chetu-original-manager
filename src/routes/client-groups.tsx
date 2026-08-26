import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ClientGroups } from "@/pages/ClientGroups";

export const Route = createFileRoute("/client-groups")({
  head: () => ({
    meta: [
      { title: "Client Groups | Chetu Microfinance" },
      { name: "description", content: "Client Groups workspace in the Chetu microfinance management system." },
      { property: "og:title", content: "Client Groups | Chetu Microfinance" },
      { property: "og:description", content: "Client Groups workspace in the Chetu microfinance management system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <ClientGroups />
    </ProtectedLayout>
  ),
});
