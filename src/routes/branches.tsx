import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Branches } from "@/pages/Branches";

export const Route = createFileRoute("/branches")({
  head: () => ({
    meta: [
      { title: "Branch Network | Chetu Microfinance" },
      { name: "description", content: "Create and manage branch offices and their staff coverage in the Chetu microfinance system." },
      { property: "og:title", content: "Branch Network | Chetu Microfinance" },
      { property: "og:description", content: "Create and manage branch offices and their staff coverage in the Chetu microfinance system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout adminOnly>
      <Branches />
    </ProtectedLayout>
  ),
});
