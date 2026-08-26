import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { GroupOfficerTransfer } from "@/pages/transfers/GroupOfficerTransfer";

export const Route = createFileRoute("/transfers/group-officer")({
  head: () => ({
    meta: [
      { title: "Group LO Transfer | Chetu Microfinance" },
      { name: "description", content: "Reassign a group and its members to a different loan officer." },
      { property: "og:title", content: "Group LO Transfer | Chetu Microfinance" },
      { property: "og:description", content: "Reassign a group and its members to a different loan officer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <GroupOfficerTransfer />
    </ProtectedLayout>
  ),
});
