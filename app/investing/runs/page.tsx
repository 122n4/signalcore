import {
  InvestingFailurePanel,
  InvestingRunHistory,
  InvestingRuntimeShell,
} from "@/components/investing/InvestingRuntimeUi";
import { loadInvestingRunsV1 } from "@/lib/investing/ui/server/loader.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InvestingRunsPage() {
  const data = await loadInvestingRunsV1();
  return (
    <InvestingRuntimeShell>
      {data.kind === "ready"
        ? <InvestingRunHistory data={data} />
        : <InvestingFailurePanel failure={data} />}
    </InvestingRuntimeShell>
  );
}
