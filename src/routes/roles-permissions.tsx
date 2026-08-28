import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { RolesPermissions } from "@/pages/RolesPermissions";

export const Route = createFileRoute("/roles-permissions")({
  head: () => ({
    meta: [
      { title: "Roles & Permissions | Chetu Microfinance" },
      {
        name: "description",
        content: "What each staff role is permitted to do, as the database enforces it.",
      },
      { property: "og:title", content: "Roles & Permissions | Chetu Microfinance" },
      {
        property: "og:description",
        content: "What each staff role is permitted to do, as the database enforces it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout managementOnly>
      <RolesPermissions />
    </ProtectedLayout>
  ),
});
