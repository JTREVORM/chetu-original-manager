import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { ProfilePage } from "@/pages/Profile";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile | Chetu Microfinance" },
      { name: "description", content: "Your account details, branch access and password." },
      { property: "og:title", content: "My Profile | Chetu Microfinance" },
      { property: "og:description", content: "Your account details, branch access and password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <ProfilePage />
    </ProtectedLayout>
  ),
});
