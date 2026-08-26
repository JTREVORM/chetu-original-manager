import { createFileRoute } from "@tanstack/react-router";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { SavingsAccountsPage } from "@/pages/Savings";

export const Route = createFileRoute("/savings-accounts")({
  head: () => ({
    meta: [
      { title: "Savings Accounts | Chetu Microfinance" },
      { name: "description", content: "Member savings accounts with weekly deposits, withdrawals and passbooks." },
      { property: "og:title", content: "Savings Accounts | Chetu Microfinance" },
      { property: "og:description", content: "Member savings accounts with weekly deposits, withdrawals and passbooks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedLayout>
      <SavingsAccountsPage />
    </ProtectedLayout>
  ),
});
