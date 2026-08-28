import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberBranchTransfer } from "@/pages/transfers/MemberBranchTransfer";

export const Route = createFileRoute("/transfers/member")({
  head: () => ({
    meta: [
      { title: "Member Branch Transfer | Chetu Microfinance" },
      {
        name: "description",
        content: "Send a member and their loans to another branch for receipt.",
      },
      { property: "og:title", content: "Member Branch Transfer | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Send a member and their loans to another branch for receipt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberBranchTransfer />
    </ProtectedLayout>
  ),
});
