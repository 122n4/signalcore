import "server-only";
import type { ScopedSqlPool } from "../dataset-catalog/postgresRepository.server";
import type { InvestingResearchScientificScope } from "../contracts";
import type { AcquisitionLease, LeaseCommand, OrchestrationRetryPolicy } from "./types";
import type { AcquisitionOrchestrationRepository } from "./repository.server";
import { ORCHESTRATION_LEASE_CONTRACT_VERSION } from "./versions";

const lease = (row: Record<string, unknown>): AcquisitionLease => ({
  contractVersion: ORCHESTRATION_LEASE_CONTRACT_VERSION,
  scope: { tenantId: String(row.tenant_id), ownerId: String(row.owner_id),
    portfolioId: String(row.portfolio_id), accountId: String(row.account_id) },
  acquisitionJobId: String(row.acquisition_job_id), attempt: Number(row.attempt),
  leaseToken: String(row.lease_token), leaseOwner: String(row.lease_owner),
  fencingToken: Number(row.fencing_token), stateVersion: Number(row.state_version),
  leasedAt: new Date(String(row.leased_at)).toISOString(),
  expiresAt: new Date(String(row.expires_at)).toISOString(),
});

export class PostgresAcquisitionOrchestrationRepository implements AcquisitionOrchestrationRepository {
  constructor(private readonly pool: ScopedSqlPool) {}
  private async query(text: string, values: readonly unknown[]) {
    const client = await this.pool.connect();
    try { return await client.query(text, values); }
    finally { client.release?.(); }
  }
  async claim(input: Readonly<{ scope: InvestingResearchScientificScope;
    acquisitionJobId: string; leaseOwner: string; leaseToken: string;
    policy: OrchestrationRetryPolicy }>) {
    const result = await this.query(
      `select * from public.investing_research_acquisition_claim_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [input.scope.tenantId,input.scope.ownerId,input.scope.portfolioId,input.scope.accountId,
        input.acquisitionJobId,input.leaseToken,input.leaseOwner,input.policy.leaseSeconds,
        input.policy.contractVersion,input.policy.maximumAttempts,input.policy.backoffSeconds,
        input.policy.executionTimeoutSeconds],
    );
    return result.rows.length === 1 ? lease(result.rows[0]) : null;
  }
  async claimNext(input: Readonly<{ scope: InvestingResearchScientificScope;
    leaseOwner: string; leaseToken: string; policy: OrchestrationRetryPolicy }>) {
    const result = await this.query(
      `select * from public.investing_research_acquisition_claim_next_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [input.scope.tenantId,input.scope.ownerId,input.scope.portfolioId,input.scope.accountId,
        input.leaseToken,input.leaseOwner,input.policy.leaseSeconds,input.policy.contractVersion,
        input.policy.maximumAttempts,input.policy.backoffSeconds,
        input.policy.executionTimeoutSeconds],
    );
    return result.rows.length === 1 ? lease(result.rows[0]) : null;
  }
  async heartbeat(command: LeaseCommand, leaseSeconds: number) {
    const result = await this.query(
      `select * from public.investing_research_acquisition_heartbeat_v1(
        $1,$2,$3,$4,$5,$6,$8,$9,$10,$7)`,
      [command.scope.tenantId,command.scope.ownerId,command.scope.portfolioId,command.scope.accountId,
        command.acquisitionJobId,command.leaseToken,leaseSeconds,command.leaseOwner,
        command.fencingToken,command.expectedStateVersion],
    );
    return result.rows.length === 1 ? lease(result.rows[0]) : null;
  }
  async finalize(command: LeaseCommand, input: Parameters<AcquisitionOrchestrationRepository["finalize"]>[1]) {
    const result = await this.query(
      `select * from public.investing_research_acquisition_finalize_v1(
        $1,$2,$3,$4,$5,$6,$9,$10,$11,$7,$8::jsonb)`,
      [command.scope.tenantId,command.scope.ownerId,command.scope.portfolioId,command.scope.accountId,
        command.acquisitionJobId,command.leaseToken,input.nextState,
        input.outcome === null ? null : JSON.stringify(input.outcome),
        command.leaseOwner,command.fencingToken,command.expectedStateVersion],
    );
    return result.rows.length === 1 ? lease(result.rows[0]) : null;
  }
  async scheduleRetry(command: LeaseCommand, input: Parameters<AcquisitionOrchestrationRepository["scheduleRetry"]>[1]) {
    const result = await this.query(
      `select * from public.investing_research_acquisition_retry_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
      [command.scope.tenantId,command.scope.ownerId,command.scope.portfolioId,command.scope.accountId,
        command.acquisitionJobId,command.leaseToken,command.leaseOwner,command.fencingToken,
        command.expectedStateVersion,input.terminalState,JSON.stringify(input.outcome),
        input.nextAcquisitionJobId],
    );
    if (result.rows.length !== 1) return {
      accepted: false, scheduled: false, acquisitionJobId: null, attempt: null, notBefore: null,
    };
    const row = result.rows[0];
    return {
      accepted: true, scheduled: Boolean(row.scheduled),
      acquisitionJobId: row.next_job_id === null ? null : String(row.next_job_id),
      attempt: row.next_attempt === null ? null : Number(row.next_attempt),
      notBefore: row.next_not_before === null ? null : new Date(String(row.next_not_before)).toISOString(),
    };
  }
}
