import type {
  CreateCanonicalInvestingRunResponseV1,
  InvestingApplicationResultV1,
  InvestingReplayResponseV1,
  InvestingRunQueryResponseV1,
} from "@/lib/investing/application";

export const INVESTING_IDENTITY_CONTEXT_VERSION =
  "investing-identity-context/v1" as const;

export const INVESTING_IDENTITY_PERMISSIONS = [
  "investing:create",
  "investing:read",
  "investing:verify",
  "investing:replay",
  "investing:*",
] as const;

export type InvestingIdentityPermissionV1 =
  (typeof INVESTING_IDENTITY_PERMISSIONS)[number];

export type InvestingIdentityOperationV1 =
  | "create_canonical_run"
  | "get_run"
  | "get_latest_run"
  | "verify_run"
  | "replay_run"
  | "create_dataset_requirement"
  | "request_dataset_acquisition"
  | "get_dataset_acquisition"
  | "cancel_dataset_acquisition"
  | "transition_dataset_acquisition"
  | "publish_dataset_version"
  | "list_datasets"
  | "get_dataset_version"
  | "evaluate_dataset_quality"
  | "get_dataset_quality_report"
  | "list_dataset_quality_reports";

export type ResolvedInvestingIdentityContextV1 = Readonly<{
  contractVersion: typeof INVESTING_IDENTITY_CONTEXT_VERSION;
  authenticatedUserId: string;
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
  role: string;
  permissions: readonly InvestingIdentityPermissionV1[];
  requestId: string;
}>;

export type InvestingIdentityFailureV1 = Readonly<{
  ok: false;
  correlationId: null;
  error: Readonly<{
    code: "identity_scope_not_authorized";
    reasonCode: "identity_scope_not_authorized";
  }>;
}>;

export type InvestingIdentityGatewayResultV1<T> =
  | InvestingApplicationResultV1<T>
  | InvestingIdentityFailureV1;

export type CreateCanonicalInvestingRunRequestV1 = Readonly<{
  sourceReference: string;
  idempotencyKey: string;
}>;

export type InvestingRunReferenceRequestV1 = Readonly<{
  runId: string;
}>;

export type CreateCanonicalInvestingRunGatewayResultV1 =
  InvestingIdentityGatewayResultV1<CreateCanonicalInvestingRunResponseV1>;
export type InvestingRunQueryGatewayResultV1 =
  InvestingIdentityGatewayResultV1<InvestingRunQueryResponseV1>;
export type InvestingReplayGatewayResultV1 =
  InvestingIdentityGatewayResultV1<InvestingReplayResponseV1>;
