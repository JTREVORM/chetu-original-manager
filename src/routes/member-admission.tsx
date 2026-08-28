import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MemberAdmission } from "@/pages/MemberAdmission";

export const Route = createFileRoute("/member-admission")({
  head: () => ({
    meta: [
      { title: "Member Admission | Chetu Microfinance" },
      {
        name: "description",
        content: "Admit a new member into a lending group and open their savings passbook.",
      },
      { property: "og:title", content: "Member Admission | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Admit a new member into a lending group and open their savings passbook.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <MemberAdmission />
    </ProtectedLayout>
  ),
});
