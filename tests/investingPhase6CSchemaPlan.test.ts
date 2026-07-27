import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  INVESTING_RESEARCH_MIGRATION_PLAN,
  INVESTING_RESEARCH_RECOVERY_PLAN,
  INVESTING_RESEARCH_SCHEMA_BLUEPRINT,
  INVESTING_RESEARCH_SCHEMA_TABLES,
  INVESTING_RESEARCH_TRANSACTION_BOUNDARIES,
  validateResearchSchemaBlueprint,
} from "@/lib/investing/research/schema-plan";

const REQUIRED_SCOPE = [
  "tenant_id",
  "owner_id",
  "portfolio_id",
  "account_id",
] as const;

describe("FASE 6C schema plan", () => {
  it("is a valid declarative blueprint without duplicate or legacy names", () => {
    expect(validateResearchSchemaBlueprint().ok).toBe(true);
    const names = INVESTING_RESEARCH_SCHEMA_TABLES.map((table) => table.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => name.startsWith("investing_research_"))).toBe(true);
    expect(names.some((name) => name.startsWith("research_lab_"))).toBe(false);
    expect(names).not.toContain("investing_research_snapshots");
    expect(names.some((name) => /trading/iu.test(name))).toBe(false);
  });

  it("covers data, research and operations responsibilities", () => {
    const names = new Set<string>(
      INVESTING_RESEARCH_SCHEMA_TABLES.map((table) => table.name),
    );
    for (const name of [
      "investing_research_dataset_requests",
      "investing_research_datasets",
      "investing_research_dataset_versions",
      "investing_research_dataset_lineage",
      "investing_research_acquisition_jobs",
      "investing_research_hypotheses",
      "investing_research_candidates",
      "investing_research_experiments",
      "investing_research_experiment_runs",
      "investing_research_artifacts",
      "investing_research_validation_reports",
      "investing_research_scientific_decisions",
      "investing_research_promotion_eligibility",
      "investing_research_jobs",
      "investing_research_idempotency_records",
      "investing_research_audit_events",
    ]) expect(names).toContain(name);
  });

  it("makes scope and RLS relational and fail-closed", () => {
    for (const table of INVESTING_RESEARCH_SCHEMA_TABLES) {
      expect(table.scopeBound).toBe(true);
      expect(table.scopeColumns).toEqual(REQUIRED_SCOPE);
      for (const column of REQUIRED_SCOPE) {
        expect(table.explicitColumns).toContain(column);
      }
      expect(table.rlsPosture.payloadScopeTrusted).toBe(false);
      expect(table.rlsPosture.authenticatedWrite).toBe("none");
      expect(table.rlsPosture.serviceRoleIsAuthorizationBoundary).toBe(false);
      expect(table.rlsPosture.privilegedRole)
        .toBe("least_privilege_scope_enforced_by_boundary");
      for (const foreignKey of table.foreignKeys) {
        expect(foreignKey.scopeRelation).toBe("same_scope");
        expect(foreignKey.columns.slice(0, REQUIRED_SCOPE.length))
          .toEqual(REQUIRED_SCOPE);
        expect(foreignKey.referencesColumns.slice(0, REQUIRED_SCOPE.length))
          .toEqual(REQUIRED_SCOPE);
        const parent = INVESTING_RESEARCH_SCHEMA_TABLES.find(
          (candidate) => candidate.name === foreignKey.referencesTable,
        );
        expect(parent?.uniqueConstraints)
          .toContainEqual(foreignKey.referencesColumns);
      }
    }
  });

  it("rejects local-only, incomplete-scope and unkeyed parent relations", () => {
    const localOnly = structuredClone(INVESTING_RESEARCH_SCHEMA_BLUEPRINT);
    Reflect.set(localOnly.tables[2].foreignKeys[0], "columns", ["dataset_id"]);
    Reflect.set(
      localOnly.tables[2].foreignKeys[0],
      "referencesColumns",
      ["dataset_id"],
    );
    expect(validateResearchSchemaBlueprint(localOnly).ok).toBe(false);

    const incomplete = structuredClone(INVESTING_RESEARCH_SCHEMA_BLUEPRINT);
    Reflect.set(
      incomplete.tables[2].foreignKeys[0],
      "columns",
      incomplete.tables[2].foreignKeys[0].columns.filter(
        (column) => column !== "account_id",
      ),
    );
    expect(validateResearchSchemaBlueprint(incomplete).ok).toBe(false);

    const missingParentKey = structuredClone(INVESTING_RESEARCH_SCHEMA_BLUEPRINT);
    const referenced = missingParentKey.tables[2].foreignKeys[0].referencesColumns;
    Reflect.set(
      missingParentKey.tables[1],
      "uniqueConstraints",
      missingParentKey.tables[1].uniqueConstraints.filter(
        (constraint) => JSON.stringify(constraint) !== JSON.stringify(referenced),
      ),
    );
    expect(validateResearchSchemaBlueprint(missingParentKey).ok).toBe(false);

    const scopedGlobalBypass = structuredClone(INVESTING_RESEARCH_SCHEMA_BLUEPRINT);
    Reflect.set(scopedGlobalBypass.tables[2].foreignKeys, 0, {
      columns: ["dataset_id"],
      referencesTable: "investing_research_datasets",
      referencesColumns: ["dataset_id"],
      scopeRelation: "global",
      globalJustification: "not sufficient for scoped tables",
    });
    expect(validateResearchSchemaBlueprint(scopedGlobalBypass).ok).toBe(false);

    const globalParent = structuredClone(INVESTING_RESEARCH_SCHEMA_TABLES[1]);
    const globalChild = structuredClone(INVESTING_RESEARCH_SCHEMA_TABLES[2]);
    for (const table of [globalParent, globalChild]) {
      Reflect.set(table, "scopeBound", false);
      Reflect.set(table, "scopeColumns", []);
      Reflect.set(table, "globalJustification", "global reference fixture");
    }
    Reflect.set(globalChild.foreignKeys, 0, {
      columns: ["dataset_id"],
      referencesTable: globalParent.name,
      referencesColumns: ["dataset_id"],
      scopeRelation: "global",
      globalJustification: "global-to-global fixture relation",
    });
    Reflect.set(globalParent, "uniqueConstraints", [
      ...globalParent.uniqueConstraints,
      ["dataset_id"],
    ]);
    const globalFixture = {
      ...structuredClone(INVESTING_RESEARCH_SCHEMA_BLUEPRINT),
      tables: [globalParent, globalChild],
    };
    expect(validateResearchSchemaBlueprint(globalFixture).ok).toBe(true);

    const noJustification = structuredClone(globalFixture);
    Reflect.set(
      noJustification.tables[1].foreignKeys[0],
      "globalJustification",
      null,
    );
    expect(validateResearchSchemaBlueprint(noJustification).ok).toBe(false);

    const scopedChild = structuredClone(globalFixture);
    Reflect.set(scopedChild.tables[1], "scopeBound", true);
    Reflect.set(scopedChild.tables[1], "scopeColumns", REQUIRED_SCOPE);
    Reflect.set(scopedChild.tables[1], "globalJustification", null);
    expect(validateResearchSchemaBlueprint(scopedChild).ok).toBe(false);

    const scopedParent = structuredClone(globalFixture);
    Reflect.set(scopedParent.tables[0], "scopeBound", true);
    Reflect.set(scopedParent.tables[0], "scopeColumns", REQUIRED_SCOPE);
    Reflect.set(scopedParent.tables[0], "globalJustification", null);
    expect(validateResearchSchemaBlueprint(scopedParent).ok).toBe(false);
  });

  it("plans immutable evidence and idempotent identities", () => {
    const byName = new Map<string, (typeof INVESTING_RESEARCH_SCHEMA_TABLES)[number]>(
      INVESTING_RESEARCH_SCHEMA_TABLES.map((table) => [table.name, table]),
    );
    expect(byName.get("investing_research_experiments")?.lifecycle)
      .toBe("immutable");
    for (const name of [
      "investing_research_artifacts",
      "investing_research_validation_reports",
      "investing_research_scientific_decisions",
      "investing_research_promotion_eligibility",
    ]) expect(byName.get(name)?.lifecycle).toBe("append_only");
    expect(byName.get("investing_research_experiments")?.uniqueConstraints)
      .toContainEqual(["scientific_digest"]);
    expect(byName.get("investing_research_experiment_runs")?.uniqueConstraints)
      .toContainEqual(["experiment_id", "attempt"]);
  });

  it("plans leases with fencing and explicit recovery", () => {
    for (const name of [
      "investing_research_acquisition_jobs",
      "investing_research_experiment_runs",
      "investing_research_jobs",
    ]) {
      const table = INVESTING_RESEARCH_SCHEMA_TABLES.find(
        (candidate) => candidate.name === name,
      );
      expect(table).toBeDefined();
      for (const column of [
        "lease_token",
        "lease_owner",
        "leased_at",
        "heartbeat_at",
        "expires_at",
        "fencing_token",
        "state_version",
      ]) expect(table?.explicitColumns).toContain(column);
    }
    expect(INVESTING_RESEARCH_RECOVERY_PLAN.recoverableStates)
      .toEqual(["queued", "leased", "running"]);
    expect(INVESTING_RESEARCH_RECOVERY_PLAN.prohibitions)
      .toContain("reuse Trading queue or filesystem lock");
  });

  it("defines all required future atomic transaction boundaries", () => {
    expect(INVESTING_RESEARCH_TRANSACTION_BOUNDARIES.map((entry) => entry.operation))
      .toEqual([
        "create_or_reuse_experiment",
        "create_attempt",
        "claim_lease",
        "heartbeat",
        "finalize_result",
        "persist_validation_report",
        "persist_scientific_decision",
        "emit_promotion_eligibility",
        "recover_expired_lease",
      ]);
    expect(INVESTING_RESEARCH_MIGRATION_PLAN).toHaveLength(9);
    expect(INVESTING_RESEARCH_SCHEMA_BLUEPRINT.rollback.afterData)
      .toContain("preserve");
  });

  it("contains no SQL, database client or executable side effect", () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "lib/investing/research/schema-plan/blueprint.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /\b(create table|alter table|drop table|insert into|update\s+\w+\s+set|delete from|select\s+.+\s+from)\b/iu,
    );
    expect(source).not.toMatch(/@supabase|from ["']pg["']|createClient|new Pool/iu);
  });
});

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.resolve(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("FASE 6C isolation", () => {
  it("keeps 6C isolated from Trading, infrastructure and ambient state", () => {
    const roots = [
      path.resolve(process.cwd(), "lib/investing/research/reproducibility"),
      path.resolve(process.cwd(), "lib/investing/research/schema-plan"),
    ];
    const source = roots.flatMap(files)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /lib\/trading|@\/lib\/trading|@supabase|from ["']pg["']|@clerk|providers?|node:fs|node:child_process|pm2|process\.cwd|process\.env|Date\.now|Math\.random|use client/iu,
    );
    expect(source).not.toMatch(
      /investing\/(server|repository|broker|execution|accounting)|investing_(orders|positions|ledger)/iu,
    );
    const hashing = readFileSync(
      path.resolve(
        process.cwd(),
        "lib/investing/research/reproducibility/hashing.server.ts",
      ),
      "utf8",
    );
    expect(hashing.match(/node:/gu)).toEqual(["node:"]);
    expect(hashing).toContain('from "node:crypto"');
    for (const file of files(
      path.resolve(process.cwd(), "lib/investing/research/reproducibility"),
    ).filter((file) => file.endsWith(".server.ts"))) {
      const serverSource = readFileSync(file, "utf8");
      expect(serverSource.trimStart().startsWith('import "server-only";'))
        .toBe(true);
    }
    const neutral = readFileSync(
      path.resolve(
        process.cwd(),
        "lib/investing/research/reproducibility/index.ts",
      ),
      "utf8",
    );
    expect(neutral).not.toMatch(/\\.server|node:crypto|server-only/iu);
    const productionFiles = ["app", "components", "lib"]
      .map((entry) => path.resolve(process.cwd(), entry))
      .flatMap(files)
      .filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) =>
        !file.includes(
          `${path.sep}lib${path.sep}investing${path.sep}research${path.sep}reproducibility${path.sep}`,
        ));
    expect(productionFiles.filter((file) =>
      /investing\/research\/reproducibility\/(?:hashing|scientificIdentity|executionIdentity|manifest|artifacts)\.server/iu
        .test(readFileSync(file, "utf8")))).toEqual([]);
    const clientComponents = productionFiles.filter((file) =>
      /^\s*["']use client["'];?/u.test(readFileSync(file, "utf8")));
    for (const client of clientComponents) {
      expect(readFileSync(client, "utf8")).not.toMatch(
        /investing\/research\/reproducibility/iu,
      );
    }
  });

  it("does not modify frozen 6B contract files", () => {
    expect(files(path.resolve(process.cwd(), "lib/investing/research/contracts")))
      .toHaveLength(12);
  });
});
