import type {
  InvestingCashSnapshot,
  InvestingOrderSubmission,
  InvestingPositionSnapshot,
} from "@/lib/investing/broker/types";

export type InvestingReconciliationSeverity = "informational" | "warning" | "material" | "critical";
export type InvestingReconciliationStatus = "passed" | "warning" | "failed";

export type InvestingReconciliationItem = {
  type: string;
  symbol?: string | null;
  severity: InvestingReconciliationSeverity;
  expected: unknown;
  observed: unknown;
  difference: unknown;
  resolutionStatus: "open" | "resolved" | "ignored";
  resolutionNote?: string | null;
  detectedAt: string;
};

export type InvestingReconciliationResult = {
  ok: boolean;
  status: InvestingReconciliationStatus;
  score: number;
  checkedAt: string;
  decisionFingerprint: string | null;
  items: InvestingReconciliationItem[];
  counts: Record<InvestingReconciliationSeverity, number>;
};

export type InvestingInternalReconciliationState = {
  cash: InvestingCashSnapshot[];
  positions: InvestingPositionSnapshot[];
  orders: InvestingOrderSubmission[];
  fills: Array<{ fillId: string; orderId: string; quantity: string; grossAmount: string; feeAmount: string; currency: string }>;
  ledgerBalanced: boolean;
  reservedCash?: InvestingCashSnapshot[];
};

export type InvestingBrokerReconciliationState = {
  cash: InvestingCashSnapshot[];
  positions: InvestingPositionSnapshot[];
  orders: InvestingOrderSubmission[];
  fills: Array<{ fillId: string; orderId: string; quantity: string; grossAmount: string; feeAmount: string; currency: string }>;
};
