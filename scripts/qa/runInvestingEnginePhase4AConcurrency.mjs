import crypto from "node:crypto";

import pg from "pg";

const { Client } = pg;
const connectionString = process.env.INVESTING_TEST_DATABASE_URL
  || "postgresql://postgres@127.0.0.1:55432/signalcore_engine4a_zero_a";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(seed, label) {
  return crypto.createHash("sha256").update(`${seed}:${label}`, "utf8").digest("hex");
}

const artifactPhases = Object.freeze({
  canonical_input: "phase3c",
  portfolio_state_derivation: "phase3c",
  risk_assessment: "phase3d",
  policy_evaluation: "phase3d",
  constraint_evaluation: "phase3d",
  feasible_decision_envelope: "phase3d",
  construction_model: "phase3e",
  preliminary_proposal: "phase3e",
  final_decision: "phase3f",
  audit_bundle: "phase3f",
  shadow_package: "phase3f",
  final_result: "phase3f",
});

function material(seed, overrides = {}) {
  const hashes = Object.fromEntries([
    "request",
    ...Object.keys(artifactPhases),
  ].map((label) => [label, hash(seed, label)]));
  return { seed, hashes: { ...hashes, ...overrides } };
}

async function account(client, owner, portfolio) {
  await client.query(
    `insert into public.investing_accounts(user_id,portfolio_id,base_currency,environment,status)
     values($1,$2,'EUR','paper','active') on conflict(user_id,portfolio_id,environment) do nothing`,
    [owner, portfolio],
  );
  const result = await client.query(
    "select id from public.investing_accounts where user_id=$1 and portfolio_id=$2 and environment='paper'",
    [owner, portfolio],
  );
  invariant(result.rowCount === 1, "phase4a_account_missing");
  return result.rows[0].id;
}

async function persist(client, spec) {
  const finalHash = spec.material.hashes.final_result;
  await client.query("begin");
  try {
    await client.query("set local role service_role");
    await client.query("set local lock_timeout='10s'");
    await client.query("set local statement_timeout='20s'");
    const claimed = await client.query(
      `insert into public.investing_engine_runs(
        run_id,requested_user_id,owner_id,account_id,account_mode,environment,as_of,
        input_snapshot_id,market_snapshot_id,mandate_snapshot_id,construction_model_snapshot_id,
        version_set,state,quality,confidence,executable,source,idempotency_scope,idempotency_key,
        request_hash,canonical_input_hash,portfolio_state_derivation_hash,risk_assessment_hash,
        policy_evaluation_hash,constraint_evaluation_hash,feasible_decision_envelope_hash,
        construction_model_hash,preliminary_proposal_hash,final_decision_hash,audit_bundle_hash,
        shadow_package_hash,final_result_hash,selected_candidate_id,manifest_version
      ) values(
        $1,$2,$2,$3,'paper','paper','2026-07-20T12:00:00.000Z',
        $4,$5,$6,$7,$8::jsonb,'proposal_ready','good',$9::jsonb,false,
        'investing_engine_v1_phase3f','engine_run',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      )
      on conflict do nothing
      returning run_id,final_result_hash`,
      [
        spec.runId, spec.owner, spec.accountId,
        `${spec.material.seed}_input`, `${spec.material.seed}_market`, `${spec.material.seed}_mandate`, `${spec.material.seed}_model`,
        JSON.stringify({
          contractVersion: "investing-engine-input/v1",
          engineVersion: "engine/v1.3.0-phase3f",
          policyVersion: "risk-policy/v1",
          modelVersion: "construction-model/v1",
          instrumentCatalogVersion: "pilot-catalog/v1",
          marketDataSchemaVersion: "investing-market-snapshot/v1",
        }),
        JSON.stringify({ value: "0.9", basis: ["phase4a_concurrency"] }),
        spec.idempotencyKey,
        spec.material.hashes.request,
        spec.material.hashes.canonical_input,
        spec.material.hashes.portfolio_state_derivation,
        spec.material.hashes.risk_assessment,
        spec.material.hashes.policy_evaluation,
        spec.material.hashes.constraint_evaluation,
        spec.material.hashes.feasible_decision_envelope,
        spec.material.hashes.construction_model,
        spec.material.hashes.preliminary_proposal,
        spec.material.hashes.final_decision,
        spec.material.hashes.audit_bundle,
        spec.material.hashes.shadow_package,
        finalHash,
        `${spec.material.seed}_candidate`,
        "investing-engine-persistence-manifest/v3",
      ],
    );

    if (claimed.rowCount === 0) {
      const existing = await client.query(
        `select run_id,final_result_hash from public.investing_engine_runs
         where owner_id=$1 and account_id=$2 and idempotency_scope='engine_run' and idempotency_key=$3`,
        [spec.owner, spec.accountId, spec.idempotencyKey],
      );
      invariant(existing.rowCount === 1, "phase4a_idempotency_claim_disappeared");
      if (existing.rows[0].final_result_hash !== finalHash) {
        throw new Error("investing_engine_idempotency_conflict");
      }
      await client.query("commit");
      return { runId: existing.rows[0].run_id, finalResultHash: finalHash, replayed: true };
    }

    for (const [artifactType, sourcePhase] of Object.entries(artifactPhases)) {
      await client.query(
        `insert into public.investing_engine_artifacts(
          run_id,owner_id,account_id,final_result_hash,artifact_type,source_phase,state,quality,
          confidence,content_hash,contract_version,schema_version,canonical_payload,sealed,executable
        ) values($1,$2,$3,$4,$5,$6,'proposal_ready','good',$7::jsonb,$8,$9,
          'investing-engine-persistence/v1',$10,true,false)`,
        [
          spec.runId, spec.owner, spec.accountId, finalHash, artifactType, sourcePhase,
          JSON.stringify({ value: "0.9", basis: ["phase4a_concurrency"] }),
          spec.material.hashes[artifactType],
          `investing-engine-${artifactType.replaceAll("_", "-")}/v1`,
          JSON.stringify({ artifactType, contractVersion: "fixture/v1", executable: false, runId: spec.runId }),
        ],
      );
    }

    const phaseRows = [
      ["phase3c", "ready", spec.material.hashes.canonical_input, spec.material.hashes.portfolio_state_derivation],
      ["phase3d", "allowed", spec.material.hashes.canonical_input, spec.material.hashes.feasible_decision_envelope],
      ["phase3e", "proposal_ready", spec.material.hashes.feasible_decision_envelope, spec.material.hashes.preliminary_proposal],
      ["phase3f", "proposal_ready", spec.material.hashes.preliminary_proposal, spec.material.hashes.final_decision],
    ];
    for (const [phase, state, inputHash, outputHash] of phaseRows) {
      await client.query(
        `insert into public.investing_engine_phase_summaries(
          run_id,owner_id,account_id,final_result_hash,phase,phase_state,quality,input_hash,
          output_hash,warning_codes,blocking_reasons,reason_codes
        ) values($1,$2,$3,$4,$5,$6,'good',$7,$8,'[]','[]','["final_proposal_ready"]')`,
        [spec.runId, spec.owner, spec.accountId, finalHash, phase, state, inputHash, outputHash],
      );
    }

    await client.query(
      `insert into public.investing_engine_reason_evidence(
        run_id,owner_id,account_id,final_result_hash,reason_code,phase_source,severity,
        consequence,evidence_hash,related_constraint
      ) values($1,$2,$3,$4,'final_proposal_ready','phase3f','info','select',$5,'paper_environment_only')`,
      [spec.runId, spec.owner, spec.accountId, finalHash, hash(spec.material.seed, "reason")],
    );
    await client.query(
      `insert into public.investing_engine_shadow_packages(
        run_id,owner_id,account_id,final_result_hash,shadow_package_hash,engine_new_result_hash,
        status,legacy_result,comparison,executable
      ) values($1,$2,$3,$4,$5,$4,'awaiting_legacy_result',null,null,false)`,
      [spec.runId, spec.owner, spec.accountId, finalHash, spec.material.hashes.shadow_package],
    );
    await client.query(
      `insert into public.investing_engine_idempotency_keys(
        run_id,owner_id,account_id,final_result_hash,scope,idempotency_key,artifact_type,expected_content_hash
      ) values($1,$2,$3,$4,'engine_run',$5,'engine_run',$4)`,
      [spec.runId, spec.owner, spec.accountId, finalHash, spec.idempotencyKey],
    );
    for (const artifactType of Object.keys(artifactPhases)) {
      await client.query(
        `insert into public.investing_engine_idempotency_keys(
          run_id,owner_id,account_id,final_result_hash,scope,idempotency_key,artifact_type,expected_content_hash
        ) values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          spec.runId, spec.owner, spec.accountId, finalHash, `artifact:${artifactType}`,
          `${spec.idempotencyKey}:${artifactType}`, artifactType, spec.material.hashes[artifactType],
        ],
      );
    }
    await client.query("set constraints all immediate");
    await client.query("commit");
    return { runId: spec.runId, finalResultHash: finalHash, replayed: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function count(client, table, runIds) {
  const result = await client.query(
    `select count(*)::int as count from public.${table} where run_id = any($1::text[])`,
    [runIds],
  );
  return result.rows[0].count;
}

const control = new Client({ connectionString });
const c1 = new Client({ connectionString });
const c2 = new Client({ connectionString });
await Promise.all([control.connect(), c1.connect(), c2.connect()]);

const marker = crypto.randomBytes(6).toString("hex");
const results = [];

try {
  const ownerA = `engine4a_concurrency_a_${marker}`;
  const ownerB = `engine4a_concurrency_b_${marker}`;
  const accountA = await account(control, ownerA, `portfolio_a_${marker}`);
  const accountB = await account(control, ownerB, `portfolio_b_${marker}`);

  const retryRun = `engine4a_retry_${marker}`;
  const retrySpec = {
    owner: ownerA,
    accountId: accountA,
    runId: retryRun,
    idempotencyKey: `retry_${marker}`,
    material: material(`retry_${marker}`),
  };
  let settled = await Promise.allSettled([persist(c1, retrySpec), persist(c2, retrySpec)]);
  invariant(
    settled.every((item) => item.status === "fulfilled"),
    `same_key_same_hash_not_retry_safe:${settled.map((item) => item.status === "rejected" ? item.reason?.message : "fulfilled").join("|")}`,
  );
  invariant(new Set(settled.map((item) => item.value.runId)).size === 1, "retry_returned_different_run");
  invariant(settled.some((item) => item.value.replayed), "retry_missing_replay_result");
  invariant(await count(control, "investing_engine_runs", [retryRun]) === 1, "retry_duplicated_run");
  invariant(await count(control, "investing_engine_artifacts", [retryRun]) === 12, "retry_duplicated_artifact");
  results.push({ race: "same_key_same_hash", fulfilled: 2, rows: 1 });

  const conflictRun = `engine4a_conflict_${marker}`;
  settled = await Promise.allSettled([
    persist(c1, {
      ...retrySpec,
      runId: conflictRun,
      material: material(`conflict_${marker}`),
    }),
    persist(c2, retrySpec),
  ]);
  invariant(settled.filter((item) => item.status === "rejected").length === 1, "same_key_different_hash_not_rejected");
  invariant(await count(control, "investing_engine_runs", [conflictRun]) === 0, "idempotency_conflict_left_run");
  results.push({ race: "same_key_different_hash", rejected: 1, rows: 0 });

  const sharedArtifactHash = hash(`shared_${marker}`, "canonical_input");
  const hashRunA = `engine4a_hash_a_${marker}`;
  const hashRunB = `engine4a_hash_b_${marker}`;
  settled = await Promise.allSettled([
    persist(c1, {
      owner: ownerA,
      accountId: accountA,
      runId: hashRunA,
      idempotencyKey: `hash_a_${marker}`,
      material: material(`hash_a_${marker}`, { canonical_input: sharedArtifactHash }),
    }),
    persist(c2, {
      owner: ownerB,
      accountId: accountB,
      runId: hashRunB,
      idempotencyKey: `hash_b_${marker}`,
      material: material(`hash_b_${marker}`, { canonical_input: sharedArtifactHash }),
    }),
  ]);
  invariant(settled.filter((item) => item.status === "fulfilled").length === 1, "same_hash_cross_owner_not_single_winner");
  invariant(await count(control, "investing_engine_runs", [hashRunA, hashRunB]) === 1, "same_hash_cross_owner_left_partial_run");
  invariant(await count(control, "investing_engine_artifacts", [hashRunA, hashRunB]) === 12, "same_hash_cross_owner_left_partial_artifacts");
  results.push({ race: "same_hash_cross_owner", fulfilled: 1, rejected: 1, completeRuns: 1 });

  const reusableModelHash = hash(`reusable_model_${marker}`, "construction_model");
  const reuseRunA = `engine4a_reuse_a_${marker}`;
  const reuseRunB = `engine4a_reuse_b_${marker}`;
  await persist(c1, {
    owner: ownerA,
    accountId: accountA,
    runId: reuseRunA,
    idempotencyKey: `reuse_a_${marker}`,
    material: material(`reuse_a_${marker}`, { construction_model: reusableModelHash }),
  });
  await persist(c2, {
    owner: ownerA,
    accountId: accountA,
    runId: reuseRunB,
    idempotencyKey: `reuse_b_${marker}`,
    material: material(`reuse_b_${marker}`, { construction_model: reusableModelHash }),
  });
  invariant(await count(control, "investing_engine_runs", [reuseRunA, reuseRunB]) === 2, "same_scope_snapshot_reuse_blocked");
  invariant(await count(control, "investing_engine_artifacts", [reuseRunA, reuseRunB]) === 24, "same_scope_snapshot_reuse_incomplete");
  results.push({ scenario: "same_scope_snapshot_reuse", completeRuns: 2 });

  const sameRun = `engine4a_same_run_${marker}`;
  settled = await Promise.allSettled([
    persist(c1, {
      owner: ownerA,
      accountId: accountA,
      runId: sameRun,
      idempotencyKey: `same_run_a_${marker}`,
      material: material(`same_run_a_${marker}`),
    }),
    persist(c2, {
      owner: ownerA,
      accountId: accountA,
      runId: sameRun,
      idempotencyKey: `same_run_b_${marker}`,
      material: material(`same_run_b_${marker}`),
    }),
  ]);
  invariant(settled.filter((item) => item.status === "fulfilled").length === 1, "same_run_different_result_not_single_winner");
  invariant(await count(control, "investing_engine_runs", [sameRun]) === 1, "same_run_different_result_duplicated");
  invariant(await count(control, "investing_engine_artifacts", [sameRun]) === 12, "same_run_different_result_partial_manifest");
  results.push({ race: "same_run_different_result", fulfilled: 1, rejected: 1, completeRuns: 1 });

  const persisted = await control.query(
    "select owner_id,account_id,final_result_hash from public.investing_engine_runs where run_id=$1",
    [retryRun],
  );
  await control.query("begin");
  try {
    await control.query("set local role service_role");
    await control.query(
      `insert into public.investing_engine_reason_evidence(
        run_id,owner_id,account_id,final_result_hash,reason_code,phase_source,severity,
        consequence,evidence_hash
      ) values($1,$2,$3,$4,'late_mutation','phase3f','info','inform',$5)`,
      [retryRun, persisted.rows[0].owner_id, persisted.rows[0].account_id, persisted.rows[0].final_result_hash, hash(marker, "late")],
    );
    await control.query("commit");
    throw new Error("sealed_run_accepted_late_child");
  } catch (error) {
    await control.query("rollback");
    invariant(error.code === "23503", `sealed_run_wrong_failure:${error.code || error.message}`);
  }
  invariant(await count(control, "investing_engine_reason_evidence", [retryRun]) === 1, "late_child_was_persisted");
  results.push({ scenario: "post_commit_append", rejected: true, rows: 1 });

  console.log(JSON.stringify({ ok: true, marker, results }, null, 2));
} finally {
  await Promise.allSettled([control.end(), c1.end(), c2.end()]);
}
