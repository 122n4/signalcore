import {
  INVESTING_OPS_LOG_VERSION,
  type InvestingOpsLogEventV1,
} from "@/lib/investing/ops/contracts";

export function investingOpsLogEvent(args: Omit<
  InvestingOpsLogEventV1,
  "contractVersion"
>): InvestingOpsLogEventV1 {
  return {
    contractVersion: INVESTING_OPS_LOG_VERSION,
    timestamp: args.timestamp,
    correlationId: args.correlationId,
    operation: args.operation,
    resultStatus: args.resultStatus,
    reasonCode: args.reasonCode,
    durationMs: Math.max(0, args.durationMs),
    scope: {
      tenantId: args.scope.tenantId,
      portfolioId: args.scope.portfolioId,
    },
  };
}
