import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout only. The network list lives in branches.index.tsx and the per-branch
// dashboard in branches.$branchId.tsx — the same split reports.tsx uses.
export const Route = createFileRoute("/branches")({
  component: () => <Outlet />,
});
