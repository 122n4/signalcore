import "server-only";

import {
  type AuthorizedResearchExecutionContext,
  type AuthorizedResearchValidationChildExecutionContext,
  type InvestingAuthorityDatabase,
} from "../authority/context";
import { hashRefV1 } from "./canonical";
import type { ResearchDatasetMaterialProviderV1 } from "./datasetMaterial";

type ResearchMaterialAttemptContextV1 =
  | AuthorizedResearchExecutionContext
  | AuthorizedResearchValidationChildExecutionContext;

const REFUSAL = "RESEARCH_MATERIAL_ACCESS_UNPROVEN" as const;

/**
 * RL-9C3B2B5: a DENIAL-ONLY adapter implementing the exact production material
 * provider contract. It cannot delegate: the factory accepts no raw provider.
 *
 * This is an independently testable security precursor. It does NOT make
 * any existing production Research/Validation entry point embargo-safe:
 * adoption, trusted mapping and full read-vs-registration synchronization
 * remain separate acceptance gates.
 */
export function createDeniedAndJournaledResearchMaterialProviderV1(
  context: ResearchMaterialAttemptContextV1,
  database: InvestingAuthorityDatabase,
): ResearchDatasetMaterialProviderV1 {
  return {
    async loadSeriesContent(untrustedRef) {
      // A digest is a locator only; it does not prove ownership or embargo
      // non-intersection. Invalid requests must never acquire observation data.
      let hashHex: string;
      try {
        const ref = hashRefV1(untrustedRef);
        if (ref.hashDomain !== "SYNTRAKE:DATASET_SERIES:V1") throw Error(REFUSAL);
        hashHex = ref.hashHex;
      } catch {
        throw Error(REFUSAL);
      }

      let client: Awaited<ReturnType<InvestingAuthorityDatabase["connect"]>> | null = null;
      let destroy = false;
      try {
        client = await database.connect();
        await client.query("begin");
        await client.query("set local statement_timeout = '5000ms'");
        await client.query("set local lock_timeout = '2000ms'");

        // The context is produced by the existing server-side authority
        // resolver in the real command flow. GUCs themselves are not
        // authentication and do not authorize a read or create an ALLOW.
        const values: Record<string, string> = {
          actor_kind: context.actorKind,
          actor_id: context.actorId,
          principal_id: context.principalId,
          tenant_id: context.tenantId,
          tenant_membership_id: context.tenantMembershipId,
          research_investigation_id: context.researchInvestigationId,
          operation: context.operation,
          capability: context.capability,
          operation_scope: context.operationScope,
          source_context: context.sourceContext,
          correlation_id: context.correlationId,
          account_id: "",
          account_access_id: "",
        };
        for (const [key, value] of Object.entries(values)) {
          await client.query("select set_config($1,$2,true)", [
            "syntrake.investing." + key, value,
          ]);
        }

        // This function (C3B2B2) writes an append-only DENIED attempt under
        // the registration tenant lock. Its only supported answer is UNPROVEN.
        // No provider bytes are retrieved before or after this statement.
        const result = await client.query<{ decision: string }>(
          "select investing.rl9c3b2b2_record_unproven_read_v1($1) as decision",
          [hashHex],
        );
        if (result.rows.length !== 1 ||
            result.rows[0]?.decision !== "UNPROVEN_NOT_AUTHORIZED") {
          throw Error(REFUSAL);
        }
        await client.query("commit");
      } catch {
        if (client) {
          try {
            await client.query("rollback");
          } catch {
            destroy = true;
          }
        }
        // Do not manufacture missing material, success, or provider fallback.
        throw Error(REFUSAL);
      } finally {
        await client?.release(destroy);
      }

      // A successful denied-attempt COMMIT is still not read permission.
      throw Error(REFUSAL);
    },
  };
}
