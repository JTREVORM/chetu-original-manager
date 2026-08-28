import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { StaffManagement } from "@/pages/StaffManagement";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Staff Management | Chetu Microfinance" },
      {
        name: "description",
        content: "Staff accounts, roles, branch assignments, permissions and system access.",
      },
      { property: "og:title", content: "Staff Management | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Staff accounts, roles, branch assignments, permissions and system access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // A Branch Manager may look after the officers in their own branches, so the
  // route is management-wide rather than admin-only. What each of them can
  // actually do is decided by the database, not by this gate.
  component: () => (
    <ProtectedLayout managementOnly>
      <StaffManagement />
    </ProtectedLayout>
  ),
});
