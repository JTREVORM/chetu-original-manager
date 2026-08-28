import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BadDebtsCollection } from "@/pages/Collections";

export const Route = createFileRoute("/bad-debts-collection")({
  head: () => ({
    meta: [
      { title: "BadDebts Collection | Chetu Microfinance" },
      {
        name: "description",
        content: "Recover payments on loans that have been declared as bad debts.",
      },
      { property: "og:title", content: "BadDebts Collection | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Recover payments on loans that have been declared as bad debts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <BadDebtsCollection />
    </ProtectedLayout>
  ),
});
