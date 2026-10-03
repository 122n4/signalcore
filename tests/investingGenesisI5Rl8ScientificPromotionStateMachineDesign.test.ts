import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_DESIGN_FREEZE_V1.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ");
}

function transitionGraph(contract: string): Array<{ from: string; to: string }> {
  const graph = contract.match(/The only admitted V1 transitions are:\n\n```text\n([\s\S]*?)\n```/);
  if (!graph) throw new Error("transition graph not found");
  return graph[1].trim().split(/\r?\n/).map((line) => {
    const [from, to] = line.split(" -> ");
    if (!from || !to) throw new Error(`malformed transition: ${line}`);
    return { from, to };
  });
}

describe("I5 RL-8 Scientific Promotion State Machine V1 design freeze", () => {
  it("remains candidate-only and design-only", () => {
    const contract = read(contractPath);
    expect(contract).toContain("Canonical predecessor:\n`0981a2a7a346051d9ccec55609c37df3885dbe56`");
    expect(contract).toContain("RL-8 acceptance:\n`NOT ACCEPTED`");
    expect(contract).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
    expect(contract).toContain("Migration:\n`NONE`");
    expect(contract).toContain("Production mutation:\n`NONE`");
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-8");
  });

  it("freezes the exact promotion subject identity and required HashRefs", () => {
    const contract = read(contractPath);
    for (const token of [
      "SCIENTIFIC_PROMOTION_SUBJECT_V1",
      "subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>",
      "subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>",
      "subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>",
      "Operational UUIDs identify persisted rows and authority scope only",
    ]) expect(contract).toContain(token);
  });

  it("freezes states, non-terminal semantics and the transition graph", () => {
    const contract = read(contractPath);
    for (const token of [
      "DRAFT_RESEARCH",
      "EXECUTED",
      "INSUFFICIENT_EVIDENCE",
      "VALIDATION_FAILED",
      "VALIDATION_PASSED",
      "PROMOTION_ELIGIBLE",
      "REJECTED",
      "SUPERSEDED",
      "INVALIDATED",
      "DRAFT_RESEARCH -> EXECUTED",
      "EXECUTED -> VALIDATION_PASSED",
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "PROMOTION_ELIGIBLE -> SUPERSEDED",
      "All other transitions are forbidden",
      "Regression is not mutation",
      "NO_TERMINAL_STATE_IN_V1",
      "A state MUST NOT be described as terminal",
      "admitted outgoing transition",
      "Historical `PROMOTION_ELIGIBLE` remains",
      "immutable evidence even when it is no longer the active/current projection",
    ]) expect(contract).toContain(token);
    expect(contract).not.toContain("Terminal states in V1 are");
  });

  it("proves no state labelled terminal has an outgoing admitted transition", () => {
    const contract = read(contractPath);
    const outgoingStates = new Set(transitionGraph(contract).map((transition) => transition.from));
    for (const state of ["PROMOTION_ELIGIBLE", "REJECTED", "INVALIDATED"]) {
      expect(outgoingStates.has(state)).toBe(true);
    }
    expect(contract).toContain("`PROMOTION_ELIGIBLE`, `REJECTED` and `INVALIDATED` are non-terminal");
    expect(outgoingStates.has("SUPERSEDED")).toBe(false);
    expect(contract).toContain("V1 has no truly terminal state token in the state vocabulary");
    expect(contract).toContain("SUPERSEDED` has no outgoing transition in the V1 graph");
  });

  it("freezes promotion-eligible gates and RL-7 consumption semantics", () => {
    const contract = read(contractPath);
    for (const token of [
      "SCIENTIFIC_PROMOTION_PROTOCOL_V20261002",
      "GATE_AUTHORITY_AND_TENANCY",
      "GATE_ACCEPTED_EXECUTION_RESULT",
      "GATE_EVIDENCE_OBJECT_BINDING",
      "GATE_VALIDATION_RESULT",
      "GATE_METRIC_RESULT_SET_V2",
      "GATE_RL7_ROBUSTNESS_COMPARISON",
      "RL-7 evidence is mandatory in V1",
      "ROBUSTNESS_STABLE -> permits further promotion evaluation",
      "ROBUSTNESS_MIXED -> INSUFFICIENT_EVIDENCE",
      "ROBUSTNESS_DEGRADED -> VALIDATION_FAILED",
      "ROBUSTNESS_UNSTABLE -> VALIDATION_FAILED",
      "UNKNOWN_RL7_CLASSIFICATION",
      "does not recompute robustness",
    ]) expect(contract).toContain(token);
  });

  it("freezes gate outcomes, closed reasons and decision precedence", () => {
    const contract = read(contractPath);
    for (const token of [
      "PASS",
      "FAIL",
      "INCOMPATIBLE_EVIDENCE",
      "UNAVAILABLE",
      "MISSING_RL7_COMPARISON",
      "INCOMPATIBLE_METRIC_REGISTRY",
      "WRONG_HASHREF_DOMAIN",
      "DIVERGENT_EXISTING_IDENTITY",
      "No free-form string carries scientific authority",
      "The V1 decision table is evaluated in this exact order",
      "Integrity, authority and lineage incompatibility dominate eligibility",
      "every required gate is PASS",
      "`PROMOTION_ELIGIBLE` exist",
    ]) expect(contract).toContain(token);
  });

  it("freezes canonical domains and exact protocol/transition payloads without runtime admission", () => {
    const contract = read(contractPath);
    const canonical = read("lib/investing/research/canonical.ts");
    for (const token of [
      "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1",
      "DESIGN_FROZEN",
      "NOT_RUNTIME_ADMITTED",
      "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
      "requiredEvidenceClasses",
      "decisionPrecedence",
      "transitionGraph",
      "SCIENTIFIC_PROMOTION_TRANSITION_V1",
      "predecessorState",
      "resultingState",
      "gateOutcomes",
      "No extra keys",
      "No third RL-8 scientific domain is admitted in V1",
      "predecessorTransition",
      "supersededByChain",
      "successorProtocol",
      "successorRootTransition",
    ]) expect(contract).toContain(token);
    expect(canonical).not.toContain("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1");
    expect(canonical).not.toContain("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
  });

  it("freezes persistence, Passport, Evidence Ledger and supersession contracts", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    const passport = read("lib/investing/research/researchPassportReader.ts");
    for (const token of [
      "This design slice writes no SQL",
      "append-only transition persistence",
      "RLS and FORCE RLS",
      "reconstruction of current state from immutable history",
      "scientificPromotion.availability = DEFERRED_RL8",
      "latestTransition",
      "currentState",
      "unique successor chain",
      "root transition to leaf transition",
      "Evidence Ledger",
      "does not create duplicate scientific truth",
      "New experiment evidence, validation rerun, Metric Registry version change",
      "`PROMOTION_ELIGIBLE` result",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("silently rewrite an old `PROMOTION_ELIGIBLE` result");
    expect(passport).toContain('scientificPromotion: { availability: "DEFERRED_RL8", transitions: [] }');
  });

  it("freezes promotion-chain identity, single-successor concurrency and protocol-change lineage", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "One promotion chain key is deterministically knowable before the first",
      "tenant authority",
      "subject Experiment HashRef",
      "protocol HashRef",
      "row insertion order",
      "mutable latest pointer",
      "caller",
    ]) expect(contract).toContain(token);
    for (const token of [
      "one accepted authoritative successor for one predecessor transition",
      "fail-closed conflict for any second divergent authoritative successor to the same predecessor",
      "If one predecessor transition has more than one authoritative successor",
      "no active/current state is projected",
      "does not choose by wall-clock time",
      "Supersession or invalidation caused by new evidence under the same protocol occurs inside the same chain",
      "A methodology/protocol change creates a new promotion chain with a different protocol HashRef",
    ]) expect(normalized).toContain(token);
    expect(normalized).toContain("The root transition HashRef is not part of the pre-root promotion chain key");
  });

  it("proves promotion-chain identity is non-circular and root creation is unique", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    const chainKeyBlock = contract.match(/One promotion chain key[\s\S]*?```text\n([\s\S]*?)\n```/);
    if (!chainKeyBlock) throw new Error("promotion chain key block not found");
    expect(chainKeyBlock[1]).toContain("tenant authority");
    expect(chainKeyBlock[1]).toContain("Investigation UUID");
    expect(chainKeyBlock[1]).toContain("subject Experiment HashRef");
    expect(chainKeyBlock[1]).toContain("subject ExperimentParameters HashRef");
    expect(chainKeyBlock[1]).toContain("subject Research IR HashRef");
    expect(chainKeyBlock[1]).toContain("protocol HashRef");
    expect(chainKeyBlock[1]).not.toContain("root transition HashRef");
    for (const token of [
      "root transition HashRef is not part of the pre-root promotion chain key",
      "One chain key can have exactly one authoritative root transition",
      "Concurrent identical root creation reuses the same root transition identity",
      "Concurrent or divergent root creation for the same chain key fails closed",
      "DIVERGENT_EXISTING_IDENTITY",
      "concurrency equivalent to one accepted authoritative root transition for one promotion chain key",
      "logical root uniqueness by tenant authority, Investigation, exact scientific subject identity and protocol HashRef",
      "Missing root, multiple roots or divergent roots for one promotion chain key fail closed",
    ]) expect(normalized).toContain(token);
  });

  it("freezes cross-chain supersession linkage and Passport reconstruction semantics", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "supersededByChain",
      "successor protocol HashRef",
      "successor root transition HashRef",
      "successorProtocol:",
      "successorRootTransition:",
      "SCIENTIFIC_PROMOTION_TRANSITION_V1",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1",
      "DIVERGENT_EXISTING_IDENTITY",
    ]) expect(contract).toContain(token);
    for (const token of [
      "Cross-chain methodology/protocol supersession is represented canonically inside the superseding",
      "SCIENTIFIC_PROMOTION_TRANSITION_V1",
      "does not introduce a third RL-8 scientific HashRef domain",
      "canonical immutable reference from the superseded old chain to the exact successor chain",
      "successor root transition MUST actually be a root transition",
      "predecessorState = DRAFT_RESEARCH",
      "predecessorTransition = null",
      "same tenant authority, same Investigation and same scientific subject lineage",
      "MUST have a different protocol HashRef when supersession is caused by methodology/protocol change",
      "Dangling successor chain references, self-reference, self-supersession and supersession cycles are forbidden and fail closed",
      "successorRootTransition",
      "MUST identify the unique accepted root belonging to the exact successor promotion chain key/protocol",
      "successor root transition MUST be the unique accepted root for the exact successor promotion chain key",
      "one old chain may point to only one accepted successor chain/root transition",
      "identical cross-chain linkage retry is idempotent",
      "divergent cross-chain linkage for the same old chain fails closed",
      "Passport follows only that immutable reference to the exact successor root transition",
      "validates that",
      "is the unique accepted root for the exact successor promotion chain key/protocol",
      "must not infer a successor chain from timestamps, insertion order, mutable latest pointers, protocol aliases or caller preference",
      "historical transitions remain immutable evidence",
    ]) expect(normalized).toContain(token);
  });

  it("preserves determinism, authority boundaries and explicit out-of-scope", () => {
    const contract = read(contractPath);
    for (const token of [
      "Identical canonical inputs plus identical protocol",
      "scientific output bytes and HashRefs",
      "no current wall-clock time as scientific input",
      "AI",
      "judgment",
      "LLM judgment",
      "environment-dependent classification",
      "Authenticated identity",
      "ownership",
      "`service_role` is capability, not authorization",
      "RL-8 MUST NOT authorize",
      "Paper order creation",
      "Live execution",
      "Capital Kernel approval",
      "Decision Firewall bypass",
      "Blind Truth / Evidence Vault implementation",
      "RL-9",
      "CORE != LAB",
      "LAB != PAPER",
      "INVESTING != TRADING",
    ]) expect(contract).toContain(token);
  });
});


describe("RL-8 recovery structural invariants", () => {
  const contract = read(contractPath);
  const normalized = compact(contract);
  const section = (name: string) => {
    const match = contract.match(new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`));
    if (!match) throw new Error(`missing section ${name}`);
    return match[1];
  };
  const block = (name: string) => {
    const match = section(name).match(/```text\n([\s\S]*?)\n```/);
    if (!match) throw new Error(`missing block ${name}`);
    return match[1];
  };

  it("records historical lineage without promoting its authority", () => {
    for (const token of [
      "CANDIDATE / NOT ACCEPTED",
      "Historical lineage only (not acceptance authority)",
      "PR #106 merge is not RL-8 acceptance",
      "b3f48e3f55a1f0c41004c60a3119fbd2cb7f84f0",
      "05b4192557e8e2c22f63769774a1ca2985199e62",
      "31bb982b17a999fe67613c7a9251218f697e9150",
      "RL-7 = CURRENT_ACCEPTED / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED",
      "I5 RESEARCH LAB = IN_PROGRESS / RL-8_TO_RL-11 / PRODUCT_UI_DEFERRED",
    ]) expect(contract).toContain(token);
    expect(new Set(contract.match(/SCIENTIFIC_PROMOTION_PROTOCOL_V\d{8}/g)))
      .toEqual(new Set(["SCIENTIFIC_PROMOTION_PROTOCOL_V20261002"]));
  });

  it("separates exact stable identity from the exact nullable transition snapshot", () => {
    expect(block("Promotion Subject")).toBe(`SCIENTIFIC_PROMOTION_SUBJECT_V1 = {
  subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>,
  subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>,
  subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>
}`);
    const snapshot = block("Transition-Specific Evidence Snapshot");
    const fields = [...snapshot.matchAll(/^  (\w+): HashRef<([^>]+)> \| null,?$/gm)]
      .map((match) => [match[1], match[2]]);
    expect(fields).toEqual([
      ["runInput", "SYNTRAKE:RUN_INPUT:V1"],
      ["result", "SYNTRAKE:RESULT:V1"],
      ["evidenceObject", "SYNTRAKE:EVIDENCE_OBJECT:V1"],
      ["validationProtocol", "SYNTRAKE:VALIDATION_PROTOCOL:V1"],
      ["validationResult", "SYNTRAKE:VALIDATION_RESULT:V1"],
      ["metricResultSet", "METRIC_RESULT_SET_V2"],
      ["robustnessComparisonProtocol", "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1"],
      ["robustnessComparisonResult", "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1"],
    ]);
    expect(snapshot.trim().split("\n")).toHaveLength(10);
    expect(block("Transition Artifact Payload")).toContain(
      "evidenceSnapshot: exact nested evidenceSnapshot structure defined above");
    expect(normalized).toContain("Every key is required; absence is explicit null");
    expect(contract).toContain("Missing evidence NEVER becomes zero/PASS/fabricated identity");
    const rows = section("Transition-Specific Evidence Snapshot").split("\n")
      .filter((line) => /^\| [A-Z_]+ \|/.test(line))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
    expect(rows).toEqual([
      ["DRAFT_RESEARCH", ...Array(8).fill("N")],
      ["EXECUTED", "R", "R", ...Array(6).fill("O")],
      ["INSUFFICIENT_EVIDENCE", "R", "R", ...Array(6).fill("O")],
      ["VALIDATION_FAILED", ...Array(8).fill("R")],
      ["VALIDATION_PASSED", ...Array(8).fill("R")],
      ...["PROMOTION_ELIGIBLE", "REJECTED", "INVALIDATED", "SUPERSEDED"]
        .map((state) => [state, ...Array(8).fill("COPY")]),
    ]);
    expect(normalized).toContain("Stage A retains the root's exact runInput/result");
    expect(normalized).toContain("RL-7 subjectResult and subjectValidationResult must match this snapshot");
  });

  it("freezes all and only the 13 admitted graph edges", () => {
    const expected = [
      "DRAFT_RESEARCH -> EXECUTED",
      "EXECUTED -> INSUFFICIENT_EVIDENCE",
      "EXECUTED -> VALIDATION_FAILED",
      "EXECUTED -> VALIDATION_PASSED",
      "INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE",
      "INSUFFICIENT_EVIDENCE -> VALIDATION_FAILED",
      "INSUFFICIENT_EVIDENCE -> VALIDATION_PASSED",
      "VALIDATION_FAILED -> REJECTED",
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "PROMOTION_ELIGIBLE -> SUPERSEDED",
      "PROMOTION_ELIGIBLE -> INVALIDATED",
      "REJECTED -> SUPERSEDED",
      "INVALIDATED -> SUPERSEDED",
    ];
    expect(transitionGraph(contract).map(({ from, to }) => `${from} -> ${to}`)).toEqual(expected);
    expect(contract).not.toContain("VALIDATION_PASSED -> REJECTED");
    expect(contract).not.toContain("owner/scientific governance rejection");
    expect(normalized).toContain("choosing not to use an eligible result is outside RL-8");
  });

  it("freezes the exact root, non-null state and state-independent successor identity", () => {
    expect(section("Transition Artifact Payload")).toContain(`predecessorTransition = null
predecessorState = DRAFT_RESEARCH
resultingState = EXECUTED`);
    expect(block("Transition Artifact Payload")).toContain("predecessorState: closed V1 state,");
    expect(contract).not.toContain("predecessorState: closed V1 state | null");
    expect(contract).not.toContain("predecessorState = null");
    for (const token of [
      "Only accepted upstream execution/result evidence can create this root",
      "Identical canonical root retry returns REUSED_IDENTICAL",
      "a divergent second root returns DIVERGENT_EXISTING_IDENTITY",
      "Successor uniqueness excludes resultingState",
      "regardless of resulting state",
      "Any second different payload/state/reason/evidence snapshot for that predecessor returns DIVERGENT_EXISTING_IDENTITY",
      "MUST later be enforceable at PostgreSQL level, not merely in TypeScript",
    ]) expect(normalized).toContain(token);
    const uniqueness = normalized.match(/logical non-root uniqueness by ([^;]+);/);
    expect(uniqueness?.[1]).toBe("tenant authority, Investigation, exact scientific subject identity, protocol HashRef and predecessor transition HashRef");
  });

  it("keeps successful evaluation distinct from deterministic eligibility materialization", () => {
    const decision = section("Decision Precedence");
    const table = block("Decision Precedence");
    expect([...table.matchAll(/-> ([A-Z_]+)/g)].map((match) => match[1]))
      .toEqual(["INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED", "VALIDATION_PASSED"]);
    expect(table).not.toContain("PROMOTION_ELIGIBLE");
    const insufficientRule = table.match(/3\.([\s\S]*?)4\./)?.[1];
    expect(insufficientRule).toContain("ROBUSTNESS_MIXED");
    expect(insufficientRule).toContain("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(compact(decision)).toContain("Stage A applies only from EXECUTED or INSUFFICIENT_EVIDENCE");
    expect(compact(decision)).toContain("same protocol and same evidence snapshot");
    expect(compact(decision)).toContain("Copy its gateOutcomes exactly");
    expect(compact(decision)).toContain("two distinct immutable scientific transition artifacts");
    expect(block("RL-7 Consumption Semantics").split("\n")).toEqual([
      "ROBUSTNESS_STABLE -> permits further promotion evaluation",
      "ROBUSTNESS_MIXED -> INSUFFICIENT_EVIDENCE",
      "ROBUSTNESS_DEGRADED -> VALIDATION_FAILED",
      "ROBUSTNESS_UNSTABLE -> VALIDATION_FAILED",
      "ROBUSTNESS_INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE",
      "null classification with fail-closed failure -> fail closed",
      "unknown classification -> fail closed",
    ]);
  });

  it("admits exactly two design domains and preserves every authority boundary", () => {
    const domains = ["SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1"];
    expect(block("Canonical Identity Domains").split("\n")).toEqual(domains);
    expect(new Set(contract.match(/SYNTRAKE:SCIENTIFIC_PROMOTION_[A-Z_]+:V1/g))).toEqual(new Set(domains));
    for (const boundary of ["investment recommendation", "suitability", "APPLY NEW CAPITAL", "Paper authorization", "Live authorization", "broker instruction", "Capital Kernel authority"])
      expect(contract).toContain(`PROMOTION_ELIGIBLE != ${boundary}`);
    expect(contract).toContain("Client IDs never prove tenant/Investigation authority");
  });
});
