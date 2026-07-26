import {
  InvestingDashboard,
  InvestingFailurePanel,
  InvestingRuntimeShell,
} from "@/components/investing/InvestingRuntimeUi";
import { loadInvestingDashboardV1 } from "@/lib/investing/ui/server/loader.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InvestingPage() {
  const data = await loadInvestingDashboardV1();
  return (
    <InvestingRuntimeShell>
      {data.kind === "ready"
        ? <InvestingDashboard data={data} />
        : <InvestingFailurePanel failure={data} />}
    </InvestingRuntimeShell>
  );
}
