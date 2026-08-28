import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Expenses } from "@/pages/Expenses";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses | Chetu Microfinance" },
      {
        name: "description",
        content: "Expenses workspace in the Chetu microfinance management system.",
      },
      { property: "og:title", content: "Expenses | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Expenses workspace in the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <Expenses />
    </ProtectedLayout>
  ),
});
