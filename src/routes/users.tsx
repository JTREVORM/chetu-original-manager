import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { UserManagement } from "@/pages/UserManagement";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User Management | Chetu Microfinance" },
      { name: "description", content: "User Management workspace in the Chetu microfinance management system." },
      { property: "og:title", content: "User Management | Chetu Microfinance" },
      { property: "og:description", content: "User Management workspace in the Chetu microfinance management system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout adminOnly>
      <UserManagement />
    </ProtectedLayout>
  ),
});
