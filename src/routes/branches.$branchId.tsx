import { createFileRoute, useParams } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { BranchDashboard } from "@/pages/BranchDashboard";

function BranchDashboardRoute() {
  const { branchId } = useParams({ from: "/branches/$branchId" });
  return (
    <ProtectedLayout managementOnly>
      <BranchDashboard branchId={branchId} />
    </ProtectedLayout>
  );
}

export const Route = createFileRoute("/branches/$branchId")({
  head: () => ({
    meta: [
      { title: "Branch Dashboard | Chetu Microfinance" },
      {
        name: "description",
        content:
          "Members, groups, loans, savings, collections and cash for a single Chetu Microfinance branch.",
      },
      { property: "og:title", content: "Branch Dashboard | Chetu Microfinance" },
      {
        property: "og:description",
        content:
          "Members, groups, loans, savings, collections and cash for a single Chetu Microfinance branch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BranchDashboardRoute,
});
