import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL9_BLIND_TRUTH_EVIDENCE_VAULT_V1_DESIGN_FREEZE_V1.md";
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const compact = (value: string) => value.replace(/\s+/g, " ");

describe("I5 RL-9 Blind Truth / Evidence Vault V1 design freeze", () => {
  it("is candidate-only, design-only and anchored after accepted RL-8", () => {
    const contract = read(contractPath);
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(contract).toContain("Canonical predecessor:\n`f06eac41cf3774a198d157b61a830fb492fb6b70`");
    expect(contract).toContain("RL-8 = CURRENT_ACCEPTED / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED");
    expect(contract).toContain("RL-9 acceptance:\n`NOT ACCEPTED`");
    expect(contract).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
    expect(contract).toContain("Migration:\n`NONE`");
    expect(contract).toContain("Production mutation:\n`NONE`");
    expect(contract).toContain("Supabase Production:\n`UNCHANGED`");
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-9");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-9_TO_RL-11 / PRODUCT_UI_DEFERRED");
  });

  it("freezes exact upstream subject and PROMOTION_ELIGIBLE entry authority", () => {
    const contract = read(contractPath);
    for (const token of [
      "subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>",
      "subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>",
      "subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>",
      "promotionProtocol: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1>",
      "promotionTransition: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1>",
      "PROMOTION_ELIGIBLE",
      "exact current reconstructed leaf",
      "historical `PROMOTION_ELIGIBLE` transition that already has an accepted",
      "re-proved when evaluation is armed and again",
      "STALE_PROMOTION_TRANSITION",
      "SUPERSEDED_PROMOTION_AUTHORITY",
      "Once reveal has started, later promotion supersession does not rewrite historical",
    ]) expect(contract).toContain(token);
  });

  it("allows exactly one registration for one exact scientific candidate", () => {
    const raw = read(contractPath);
    const contract = compact(raw);
    const key = raw.match(/The V1 logical Blind Truth candidate key is:\n\n```text\n([\s\S]*?)\n```/);
    if (!key) throw new Error("Blind Truth candidate key not found");
    expect(key[1]).toContain("subject Experiment HashRef");
    expect(key[1]).toContain("subject ExperimentParameters HashRef");
    expect(key[1]).toContain("subject Research IR HashRef");
    expect(key[1]).not.toContain("Investigation UUID");
    expect(key[1]).not.toContain("promotion Protocol HashRef");
    expect(key[1]).not.toContain("promotion PROMOTION_ELIGIBLE Transition HashRef");
    for (const token of [
      "Exactly one authoritative Blind Truth registration is admitted for this logical candidate key in V1",
      "Investigation UUID is deliberately NOT part of the one-shot uniqueness key",
      "Creating a new Investigation for the same exact scientific subject MUST NOT reopen Blind Truth eligibility",
      "The bound RL-8 promotion Protocol/Transition are required eligibility evidence, but they are deliberately NOT part of the one-shot uniqueness key",
      "A later RL-8 methodology/protocol change or re-promotion of the same exact scientific subject MUST NOT reopen Blind Truth eligibility",
      "Changing an Investigation UUID, protocol id, promotion transition, random salt, storage locator, encryption key, request id or retry token MUST NOT create a second Blind Truth attempt",
      "A retest of the same exact candidate after seeing holdout truth is forbidden",
      "Concurrent identical registration reuses the same scientific identity",
      "Concurrent or divergent registration for the same logical candidate key fails closed",
    ]) expect(contract).toContain(token);
  });

  it("freezes hypothesis, markets/timeframe/fields, parameters, metrics and thresholds before reveal", () => {
    const contract = read(contractPath);
    for (const token of [
      "hypothesis` is an exact `HashRef<SYNTRAKE:HYPOTHESIS:V1>",
      "BLIND_TRUTH_HOLDOUT_SCOPE_V1",
      "providerDatasetVersion",
      "markets",
      "frequency",
      "fields",
      "coverageStart",
      "coverageEnd",
      "subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>",
      "metricRequestSet: HashRef<SYNTRAKE:METRIC_REQUEST_SET:V1>",
      "blindTruthCriteria",
      "the Registration HashRef is the exact scientific identity of the frozen",
      "Blind Truth threshold/criteria set",
      "Thresholds MUST NOT be selected, changed or reinterpreted after reveal",
      "Metrics MUST NOT be added, removed or reordered after reveal",
      "Experiment parameters MUST NOT be changed after reveal",
      "There is no duplicate second source of truth for parameters, metrics or",
      "scientific freeze point is the accepted Registration HashRef plus the",
      "Wall-clock `created_at` is operational evidence",
      "only and is not the scientific freeze identity",
      "engineId = HISTORICAL_EXECUTION_ADAPTER",
      "engineVersion = ENGINE_V20260926",
      "metricRegistryVersion = METRIC_REGISTRY_V20260927",
      "metricResultArtifactSchemaVersion = METRIC_RESULT_SET_V2",
      "blindTruthEvaluatorBehaviorVersion = BLIND_TRUTH_EVALUATOR_V1",
      "BLIND_TRUTH_CRITERION_V1 {",
      "criterionVersion",
      "BETWEEN_INCLUSIVE",
      "OUTSIDE_EXCLUSIVE",
      "Blind Truth criteria deliberately omit Validation-only evidence-source",
      "An empty criteria set or an all-optional criteria set is invalid",
    ]) expect(contract).toContain(token);
  });

  it("freezes salted public commitment without leaking secret material", () => {
    const contract = read(contractPath);
    for (const token of [
      "SHA256_DOMAIN_SEPARATED_SALTED_V1",
      "SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1",
      "secret_random_salt_32_bytes",
      "exact_canonical_holdout_plaintext_bytes",
      "public seal stores the resulting commitment hash but not the salt",
      "SYNTRAKE:BLIND_TRUTH_HOLDOUT_SCOPE:V1",
      "does not create a",
      "sixth scientific domain",
      "Commitment mismatch",
      "fails closed before a",
      "scientific PASS/FAIL result can exist",
    ]) expect(contract).toContain(token);
    expect(contract).toContain("MUST NOT contain raw observations, decrypted bytes");
  });

  it("requires a real secret capability boundary and rejects service_role as the vault boundary", () => {
    const contract = compact(read(contractPath));
    for (const token of [
      "The secret vault MUST use a dedicated secret-bearing capability",
      "The vault credential MUST NOT be available to the ordinary `investing_app` research runtime",
      "The standard Supabase `service_role` credential by itself is NOT an accepted V1 vault-secrecy boundary",
      "The future implementation MUST prove capability separation at runtime, not only through TypeScript visibility",
      "AI prompts",
      "optimizer callbacks",
    ]) expect(contract).toContain(token);
  });

  it("requires a Syntrake-controlled source embargo and does not overclaim human secrecy", () => {
    const contract = compact(read(contractPath));
    for (const token of [
      "Vault secrecy is insufficient if the same holdout truth can be fetched through an ordinary market-data/provider path",
      "requires an internal holdout embargo for the exact public `holdoutScope`",
      "has not already been materialized into an ordinary research cache",
      "authoritative registration creation and embargo activation are atomic",
      "canonical market ids intersect",
      "canonical field ids intersect",
      "coverage interval",
      "regardless of requested frequency",
      "Unknown or ambiguous provider-field mapping fails closed",
      "Vault ingestion uses the dedicated vault capability, not the ordinary Research data-resolver credential",
      "append-only access evidence sufficient to prove",
      "Absence from application logs",
      "does not claim to prove that a human user could not obtain the same public market facts",
      "HOLDOUT_ALREADY_EXPOSED",
      "EMBARGO_VIOLATION",
      "ACCESS_AUDIT_UNAVAILABLE",
    ]) expect(contract).toContain(token);
  });

  it("blocks same-plaintext reseal through a confidential anti-reuse index", () => {
    const contract = read(contractPath);
    for (const token of [
      "HMAC-SHA-256(",
      "vault_reuse_key",
      "SYNTRAKE:BLIND_TRUTH_REUSE_FINGERPRINT:V1",
      "canonical_holdout_truth_bytes",
      "deliberately exclude provider locator",
      "Provider relabeling therefore cannot",
      "same plaintext from being",
      "resealed under a new salt",
      "Vault reuse-key rotation MUST preserve historical duplicate detection",
      "If that continuity cannot be proven, new sealing fails closed",
      "A plaintext holdout already sealed for another V1 registration is rejected",
      "ANTI_REUSE_INDEX_UNAVAILABLE",
      "ANTI_REUSE_KEY_ROTATION_INCOMPLETE",
      "HOLDOUT_REUSE_DETECTED",
    ]) expect(contract).toContain(token);
  });

  it("freezes one-shot evaluation and claim-before-secret-read semantics", () => {
    const contract = compact(read(contractPath));
    for (const token of [
      "creates exactly one immutable `BLIND_TRUTH_EVALUATION_V1` identity",
      "One registration + one vault seal has exactly one authoritative evaluation identity",
      "persist an append-only `REVEAL_STARTED` event for the exact evaluation identity before the vault authority is allowed to open secret material",
      "The reveal claim is the point of no return",
      "consume-once operation bound to the exact evaluation identity",
      "MUST NOT expose a reusable ordinary `get secret bytes` operation",
      "A second consume call must fail inside the vault authority",
      "a process crash does not restore eligibility for another reveal",
      "REVEAL_CONSUMED_RESULT_UNAVAILABLE",
      "The system MUST NOT infer from elapsed time that the secret was never observed",
    ]) expect(contract).toContain(token);
  });

  it("freezes the reveal/result event graph as append-only with one final successor", () => {
    const contract = read(contractPath);
    for (const token of [
      "<none> -> REVEAL_STARTED",
      "REVEAL_STARTED -> REVEAL_COMPLETED",
      "REVEAL_STARTED -> REVEAL_FAILED_CLOSED",
      "All other transitions are forbidden",
      "at most one final successor",
      "Wall-clock order never chooses a winner",
      "REVEAL_COMPLETED",
      "REVEAL_FAILED_CLOSED",
    ]) expect(contract).toContain(token);
  });

  it("freezes deterministic evaluation without holdout optimization or threshold selection", () => {
    const contract = read(contractPath);
    for (const token of [
      "BLIND_TRUTH_RESULT_V1",
      "observedMetricResults",
      "criterionOutcomes",
      "overallOutcome",
      "PASS",
      "FAIL",
      "INSUFFICIENT_EVIDENCE",
      "Integrity/authority failures are not converted into these scientific outcomes",
      "MUST produce the accepted `METRIC_RESULT_SET_V2` artifact",
      "`observedMetricResults` is the exact",
      "canonical selected metric-record evidence derived from that artifact",
      "Every Blind Truth criterion metric must exist in the frozen MetricRequestSet",
      "MUST NOT optimize, refit, search, select a best variant",
      "any required criterion = FAIL",
      "any required criterion = INSUFFICIENT_EVIDENCE",
      "every required criterion = PASS",
      "Optional criteria are diagnostic only",
      "Malformed metric evidence, wrong registry, wrong numeric kind or criterion drift",
      "No undocumented composite score may decide the result",
    ]) expect(contract).toContain(token);
  });

  it("reuses accepted DatasetSeries/DatasetSnapshot only after commitment verification", () => {
    const contract = read(contractPath);
    for (const token of [
      "Only after successful commitment verification",
      "HashRef<SYNTRAKE:DATASET_SERIES:V1>[]",
      "HashRef<SYNTRAKE:DATASET_SNAPSHOT:V1>",
      "No new RL-9 replacement domain is created for DatasetSeries or DatasetSnapshot",
      "do not exist as authoritative revealed-holdout evidence before the",
    ]) expect(contract).toContain(token);
  });

  it("freezes exactly five future domains without runtime admission", () => {
    const contract = read(contractPath);
    const canonical = read("lib/investing/research/canonical.ts");
    const domains = [
      "SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1",
      "SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1",
      "SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1",
      "SYNTRAKE:BLIND_TRUTH_EVALUATION:V1",
      "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1",
    ];
    for (const domain of domains) {
      expect(contract).toContain(domain);
      expect(canonical).not.toContain(domain);
    }
    expect(contract).toContain("DESIGN_FROZEN / NOT_RUNTIME_ADMITTED");
    expect(contract).toContain("No sixth RL-9 scientific domain is admitted in V1");
    expect(contract).toContain("This design does not modify `HashDomainV1`");
  });

  it("freezes closed canonical payload shapes and separates scientific from operational secrets", () => {
    const contract = read(contractPath);
    for (const token of [
      "BLIND_TRUTH_PROTOCOL_V1 = {",
      "BLIND_TRUTH_REGISTRATION_V1 = {",
      "BLIND_TRUTH_VAULT_SEAL_V1 = {",
      "BLIND_TRUTH_EVALUATION_V1 = {",
      "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1 = {",
      "No extra keys are admitted",
      "NON_SCIENTIFIC_OPERATIONAL",
      "Scientific hashing and secret-vault encryption are separate concerns",
    ]) expect(contract).toContain(token);
  });

  it("freezes future persistence, real integration evidence and Production gate requirements", () => {
    const contract = read(contractPath);
    for (const token of [
      "This design slice writes no SQL",
      "RLS + FORCE RLS",
      "exactly one registration per logical candidate key",
      "uniqueness enforced",
      "across Investigation UUIDs inside one tenant",
      "exactly one seal per registration",
      "exactly one evaluation per registration/seal",
      "exactly one `REVEAL_STARTED` per evaluation",
      "no PUBLIC / anon / authenticated / service_role mutation authority",
      "ordinary research credentials cannot fetch secret holdout material",
      "ordinary provider/data-resolver paths reject the embargoed holdout scope",
      "pre-reveal access evidence proves no prior Syntrake-controlled exposure",
      "`service_role` alone cannot fetch secret holdout material",
      "same plaintext reseal is rejected",
      "PostgreSQL 17 persistence rehearsal passes",
      "managed Supabase preview/rehearsal passes before Production",
      "Production mutation requires separate explicit authorization",
    ]) expect(contract).toContain(token);
  });

  it("keeps Passport projection secret before reveal and preserves downstream boundaries", () => {
    const contract = read(contractPath);
    for (const token of [
      "blindTruth.availability",
      "public commitment metadata",
      "MUST NOT expose secret material, secret salt, storage locator",
      "overallOutcome = PASS | FAIL | INSUFFICIENT_EVIDENCE | null",
      "Evidence Ledger records immutable references/events",
      "No AI, LLM, optimizer, hyperparameter search",
      "RL-10 may later orchestrate retries",
      "RL-10 MUST NOT make a consumed Blind Truth reveal retryable",
      "A one-shot holdout PASS is evidence, not proof of future profitability",
      "Paper",
      "Live",
      "Capital Kernel",
      "RL-11 full I5 closure",
    ]) expect(contract).toContain(token);
  });

  it("freezes the implementation sequence without implementing any slice", () => {
    const contract = read(contractPath);
    for (const token of [
      "RL-9A canonical runtime + closed registration/seal/evaluation/event payloads",
      "RL-9B public metadata persistence + authority + one-shot event constraints",
      "RL-9C dedicated secret vault adapter + anti-reuse boundary",
      "RL-9D one-shot reveal/evaluator integration + real failure/concurrency tests",
      "RL-9E managed-Supabase preview + Production gate + canonical acceptance sync",
      "RL-9 BLIND TRUTH / EVIDENCE VAULT V1 DESIGN = CANDIDATE / NOT ACCEPTED",
      "RUNTIME = NOT IMPLEMENTED BY THIS SLICE",
      "SUPABASE = UNCHANGED",
      "PRODUCTION = UNCHANGED",
    ]) expect(contract).toContain(token);
  });
});
