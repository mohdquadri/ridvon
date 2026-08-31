import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { MultiChart } from "@/components/charts/multi-chart";

export const Route = createFileRoute("/charts")({ component: ChartsPage });

function ChartsPage() {
  return (
    <AppShell sidebar={false}>
      <MultiChart />
    </AppShell>
  );
}
