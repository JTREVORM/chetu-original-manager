import { createFileRoute } from "@tanstack/react-router";
import { Login } from "@/pages/Login";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in | Chetu Microfinance" },
      {
        name: "description",
        content: "Sign in to the Chetu microfinance management system to manage clients and loans.",
      },
      { property: "og:title", content: "Sign in | Chetu Microfinance" },
      {
        property: "og:description",
        content: "Sign in to the Chetu microfinance management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});
