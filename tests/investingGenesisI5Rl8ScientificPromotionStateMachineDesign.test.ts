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
      "DRAFT_RESEARCH -> EXECUTED",
      "EXECUTED -> VALIDATION_PASSED",
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "PROMOTION_ELIGIBLE -> SUPERSEDED",
      "All other transitions are forbidden",
      "Regression is not mutation",
      "`SUPERSEDED` is the only terminal promotion-chain state in V1",
      "A state MUST NOT be described as terminal",
      "admitted outgoing transition",
      "Historical `PROMOTION_ELIGIBLE` remains",
      "immutable evidence even when it is no longer the active/current projection",
    ]) expect(contract).toContain(token);
    expect(contract).not.toContain("Terminal states in V1 are");
    expect(contract).not.toContain("NO_TERMINAL_STATE_IN_V1");
  });

  it("proves no state labelled terminal has an outgoing admitted transition", () => {
    const contract = read(contractPath);
    const outgoingStates = new Set(transitionGraph(contract).map((transition) => transition.from));
    for (const state of ["PROMOTION_ELIGIBLE", "REJECTED"]) {
      expect(outgoingStates.has(state)).toBe(true);
    }
    expect(contract).toContain("`PROMOTION_ELIGIBLE` and `REJECTED` are non-terminal");
    expect(outgoingStates.has("SUPERSEDED")).toBe(false);
    expect(contract).toContain("`SUPERSEDED` is the only terminal promotion-chain state in V1");
    expect(compact(contract)).toContain("It has zero admitted outgoing V1 transitions");
  });

  it("freezes promotion-eligible gates and RL-7 consumption semantics", () => {
    const contract = read(contractPath);
    for (const token of [
      "SCIENTIFIC_PROMOTION_PROTOCOL_V20261002",
      "GATE_AUTHORITY_AND_TENANCY",
      "GATE_ACCEPTED_EXECUTION_RESULT",
      "GATE_EVIDENCE_OBJECT_BINDING",
      "GATE_VALIDATION_RESULT",
      "GATE_VALIDATION_ASSESSMENT",
      "GATE_METRIC_RESULT_SET_V2",
      "GATE_RL7_ROBUSTNESS_COMPARISON",
      "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
      "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1",
      "RL-8 MUST consume only the unique authoritative accepted Validation Assessment",
      "MUST NOT infer scientific PASS/FAIL directly from",
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
      "MISSING_VALIDATION_ASSESSMENT_AUTHORITY",
      "AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY",
      "INCOMPATIBLE_VALIDATION_ASSESSMENT",
      "INCOMPATIBLE_METRIC_REGISTRY",
      "WRONG_HASHREF_DOMAIN",
      "DIVERGENT_EXISTING_IDENTITY",
      "No free-form string carries scientific authority",
      "The V1 decision table is evaluated in this exact order",
      "Integrity, authority and lineage incompatibility dominate eligibility",
      "every required RL-8 gate is PASS",
      "`PROMOTION_ELIGIBLE` exist",
      "No authoritative transition is emitted",
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
      "New experiment evidence, validation rerun, Metric Registry evidence",
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
      "Re-evaluation caused by new accepted evidence under the same protocol occurs inside the same chain",
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
      "MUST have a different protocol HashRef for every SUPERSEDED transition",
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
      ["validationAssessmentProtocol", "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1"],
      ["validationAssessmentResult", "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1"],
      ["metricResultSet", "METRIC_RESULT_SET_V2"],
      ["robustnessComparisonProtocol", "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1"],
      ["robustnessComparisonResult", "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1"],
    ]);
    expect(fields).toHaveLength(10);
    expect(block("Transition Artifact Payload")).toContain(
      "evidenceSnapshot: exact nested evidenceSnapshot structure defined above");
    expect(normalized).toContain("Every key is required; absence is explicit null");
    expect(contract).toContain("Missing evidence NEVER becomes zero/PASS/fabricated identity");
    const rows = section("Transition-Specific Evidence Snapshot").split("\n")
      .filter((line) => /^\| [A-Z_]+ \|/.test(line))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
    expect(rows).toEqual([
      ["DRAFT_RESEARCH", ...Array(10).fill("N")],
      ["EXECUTED", "R", "R", ...Array(8).fill("N")],
      ["INSUFFICIENT_EVIDENCE", "R", "R", "O", "R", "R", "R", "R", "O", "O", "O"],
      ["VALIDATION_FAILED", ...Array(10).fill("R")],
      ["VALIDATION_PASSED", ...Array(10).fill("R")],
      ...["PROMOTION_ELIGIBLE", "REJECTED", "SUPERSEDED"]
        .map((state) => [state, ...Array(10).fill("COPY")]),
    ]);
    expect(normalized).toContain("The exact snapshot contains these 10 mandatory keys");
    expect(normalized).toContain("Missing or ambiguous Validation Assessment authority is not ordinary scientific insufficiency");
    expect(normalized).toContain("accepted RL-3D authority requires fail closed before any RL-8 transition");
    expect(normalized).toContain("Stage A binds the new accepted evidenceSnapshot for the same stable subject");
    expect(normalized).toContain("The accepted RL-7 comparison protocol/result lineage consumed by RL-8 must bind its subjectResult and subjectValidationResult to the exact result and validationResult HashRefs in this transition evidenceSnapshot");
    expect(normalized).toContain("Those fields belong to accepted RL-7 comparison evidence, not SCIENTIFIC_PROMOTION_SUBJECT_V1");
  });

  it("freezes all and only the 19 admitted graph edges", () => {
    const expected = [
      "DRAFT_RESEARCH -> EXECUTED",
      "EXECUTED -> INSUFFICIENT_EVIDENCE",
      "EXECUTED -> VALIDATION_FAILED",
      "EXECUTED -> VALIDATION_PASSED",
      "INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE",
      "INSUFFICIENT_EVIDENCE -> VALIDATION_FAILED",
      "INSUFFICIENT_EVIDENCE -> VALIDATION_PASSED",
      "PROMOTION_ELIGIBLE -> INSUFFICIENT_EVIDENCE",
      "PROMOTION_ELIGIBLE -> VALIDATION_FAILED",
      "PROMOTION_ELIGIBLE -> VALIDATION_PASSED",
      "REJECTED -> INSUFFICIENT_EVIDENCE",
      "REJECTED -> VALIDATION_FAILED",
      "REJECTED -> VALIDATION_PASSED",
      "VALIDATION_FAILED -> REJECTED",
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "EXECUTED -> SUPERSEDED",
      "INSUFFICIENT_EVIDENCE -> SUPERSEDED",
      "PROMOTION_ELIGIBLE -> SUPERSEDED",
      "REJECTED -> SUPERSEDED",
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
    const table = decision.match(/The V1 decision table is evaluated in this exact order:\n\n```text\n([\s\S]*?)\n```/)?.[1] ?? "";
    expect([...table.matchAll(/-> ([A-Z_]+)/g)].map((match) => match[1]))
      .toEqual(["INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED", "VALIDATION_PASSED"]);
    expect(table).not.toContain("PROMOTION_ELIGIBLE");
    const insufficientRule = table.match(/3\.([\s\S]*?)4\./)?.[1];
    expect(insufficientRule).toContain("ROBUSTNESS_MIXED");
    expect(insufficientRule).toContain("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(block("Decision Precedence").split("\n")).toEqual([
      "EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED",
    ]);
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

  it("freezes root bytes independently of later evidence availability", () => {
    const root = section("Transition Artifact Payload").match(/The root is exactly:\n\n```text\n([\s\S]*?)\n```/)?.[1];
    expect(root).toBe(`predecessorTransition = null
predecessorState = DRAFT_RESEARCH
resultingState = EXECUTED
gateOutcomes = []
transitionReasons = []
supersedes = null
rejectedTransition = null
supersededByChain = null`);
    expect(normalized).toContain("All eight later evidence fields MUST be null, even when those artifacts already exist");
    expect(normalized).toContain("Creating the same root before or after validation, metrics or RL-7 evidence exists MUST produce identical canonical bytes and scientific identity");
  });

  it("requires complete Stage A gates and exact authoritative reasons", () => {
    const gates = compact(section("Gate Outcome Completeness"));
    for (const rule of [
      "Root gateOutcomes = []",
      "exactly ONE outcome for EVERY gate in the protocol's exact gateVocabulary",
      "No missing gate id. No duplicate gate id. No unknown gate id.",
      "PASS has reasons = []",
      "every non-PASS outcome has a nonempty byte-sorted unique array",
      "Authority failure, corruption, incompatible identity/schema/protocol, unknown gate/state/classification or any other fail-closed condition produces NO authoritative RL-8 transition",
      "they do not recompute gates",
    ]) expect(gates).toContain(rule);
    expect(block("Gate Outcome Completeness").split("\n")).toEqual([
      "VALIDATION_PASSED: every required gate = PASS; transitionReasons = []",
      "INSUFFICIENT_EVIDENCE: transitionReasons = byte-sorted unique union of all non-PASS gate reasons",
      "VALIDATION_FAILED: transitionReasons = byte-sorted unique union of all non-PASS gate reasons",
    ]);
  });

  it("freezes every lifecycle link, snapshot, gate and reason rule", () => {
    const lifecycle = section("Exact Lifecycle Link Rules");
    const rows = lifecycle.split("\n").filter((line) => /^\| [A-Z_]+ \|/.test(line))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
    expect(rows).toEqual([
      ["ROOT", "null", "null", "null", "null", "ROOT_EXACT", "[]", "[]"],
      ["STAGE_A", "P", "null", "null", "null", "NEW_ACCEPTED", "COMPLETE_GATES", "EVALUATION_REASONS"],
      ["PROMOTION_ELIGIBLE", "P", "null", "null", "null", "COPY", "COPY", "[]"],
      ["REJECTED", "P", "null", "P", "null", "COPY", "COPY", "COPY"],
      ["SUPERSEDED", "P", "P", "null", "REQUIRED_CHAIN", "COPY", "COPY", "[SUPERSEDED_EVIDENCE]"],
    ]);
    for (const rule of [
      "P = exact non-null predecessorTransition HashRef in the same chain",
      "no optional lifecycle reference may be arbitrarily populated",
      "SUPERSEDED V1 = cross-protocol chain replacement only",
      "exact unique root of the different successor protocol chain",
      "SUPERSEDED remains the old-chain V1 endpoint",
      "A missing or incompatible lifecycle link fails closed",
    ]) expect(compact(lifecycle)).toContain(rule);
    expect(normalized).toContain("`supersededByChain` is REQUIRED if and only if `resultingState = SUPERSEDED`");
  });

  it("makes re-evaluation direct and both closure pairs mandatory and atomic", () => {
    const decision = compact(section("Decision Precedence"));
    for (const rule of [
      "Re-evaluation requires a new accepted evidenceSnapshot and a direct successor in the SAME chain",
      "SUPERSEDED is never an intermediary for same-protocol refresh",
      "Historical predecessor transitions remain immutable; the new successor makes the predecessor no longer the active leaf",
      "MUST persist each Stage A transition and its required deterministic closure successor atomically in one DB transaction",
      "Either both artifacts commit or neither commits",
      "No external writer may interleave another successor between the pair",
      "two distinct immutable transition HashRefs",
      "never externally committed active leaves",
      "A committed orphan intermediate is corrupt history",
    ]) expect(decision).toContain(rule);
    expect(section("Decision Precedence")).toContain(`The deterministic closure pairs are exactly:

\`\`\`text
VALIDATION_PASSED -> PROMOTION_ELIGIBLE
VALIDATION_FAILED -> REJECTED
\`\`\``);
    const graph = transitionGraph(contract);
    for (const [from, to] of [["VALIDATION_PASSED", "PROMOTION_ELIGIBLE"], ["VALIDATION_FAILED", "REJECTED"]]) {
      expect(graph.filter((edge) => edge.from === from)).toEqual([{ from, to }]);
    }
    expect(graph.filter((edge) => edge.to === "SUPERSEDED").map((edge) => edge.from))
      .toEqual(["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"]);
    expect(graph.filter((edge) => edge.from === "SUPERSEDED")).toEqual([]);
  });


  function protocolArray(name: string): unknown[] {
    const match = block("Scientific Promotion Protocol Payload").match(
      new RegExp(`^  ${name}: (\\[[\\s\\S]*?^  \\]),?$`, "m"),
    );
    if (!match) throw new Error(`missing canonical protocol array ${name}`);
    return JSON.parse(match[1]) as unknown[];
  }

  it("freezes the exact eight states and removes post-hoc invalidation authority", () => {
    expect(block("State Vocabulary").split("\n")).toEqual([
      "DRAFT_RESEARCH", "EXECUTED", "INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED",
      "VALIDATION_PASSED", "PROMOTION_ELIGIBLE", "REJECTED", "SUPERSEDED",
    ]);
    for (const removed of ["INVALIDATED", "invalidates", "lifecycleEvidence", "invalidationEvidenceDomains", "invalidationCauseReasons"])
      expect(contract).not.toContain(removed);
    const graph = transitionGraph(contract);
    expect(graph).toHaveLength(19);
    const sources = ["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"];
    expect(block("Decision Precedence").split("\n")).toEqual(sources);
    for (const outcome of ["INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED", "VALIDATION_PASSED"])
      expect(graph.filter(({ to }) => to === outcome).map(({ from }) => from)).toEqual(sources);
    expect(graph.filter(({ to }) => to === "SUPERSEDED").map(({ from }) => from)).toEqual(sources);
    expect(compact(section("Transition Graph"))).toContain("All other transitions are forbidden and fail closed with `FORBIDDEN_TRANSITION`");
  });

  it("fails closed on history integrity errors without manufacturing scientific state", () => {
    const rules = compact(section("Integrity And Reconstruction Failures"));
    for (const rule of [
      "RL-8 V1 does not own a generic post-hoc integrity-finding authority",
      "Corrupt, unauthorized, malformed or incompatible accepted-history reads remain FAIL-CLOSED",
      "They do not automatically create a scientific transition or a lifecycle state",
      "No replacement proof object or third scientific domain is introduced",
      "CORRUPTED_EVIDENCE, UNAUTHORIZED_EVIDENCE, AUTHORITY_FAILURE, WRONG_LINEAGE and INCOMPATIBLE_* codes remain evaluation/read errors",
      "NO authoritative transition is produced",
      "MUST produce no active/current scientific projection and an explicit corruption/fail-closed error",
      "Availability is unavailable due to corruption",
      "No timestamp fallback. No nearest-valid transition selection. No caller preference. No mutation of history.",
      "This error cannot be converted into an authoritative lifecycle transition",
    ]) expect(rules).toContain(rule);
    const reasons = section("Gate Outcomes And Reasons");
    for (const reason of ["CORRUPTED_EVIDENCE", "UNAUTHORIZED_EVIDENCE", "AUTHORITY_FAILURE", "WRONG_LINEAGE", "INCOMPATIBLE_SCHEMA_VERSION", "INCOMPATIBLE_PROTOCOL_VERSION"])
      expect(reasons).toContain(reason);
  });

  it("binds literal closed decision precedence tokens to exact ordered semantics", () => {
    const tokens = [
      "FAIL_CLOSED_INTEGRITY_AUTHORITY_LINEAGE", "FORBIDDEN_TRANSITION",
      "INSUFFICIENT_EVIDENCE_OUTCOME", "VALIDATION_FAILED_OUTCOME", "VALIDATION_PASSED_OUTCOME",
    ];
    expect(protocolArray("decisionPrecedence")).toEqual(tokens);
    expect(block("Scientific Promotion Protocol Payload")).not.toContain("exact ordered V1 decision table token list");
    const table = section("Decision Precedence").match(/The V1 decision table is evaluated in this exact order:\n\n```text\n([\s\S]*?)\n```/)?.[1] ?? "";
    expect([...table.matchAll(/^([1-5])\. ([A-Z_]+)$/gm)].map((match) => match[2])).toEqual(tokens);
    const rules = table.trim().split(/\n\n/);
    expect(rules).toHaveLength(5);
    const outcomes = [
      "-> fail closed; no authoritative promotion state is produced",
      "-> fail closed with FORBIDDEN_TRANSITION",
      "-> INSUFFICIENT_EVIDENCE", "-> VALIDATION_FAILED", "-> VALIDATION_PASSED",
    ];
    rules.forEach((rule, i) => {
      expect(rule).toContain(`${i + 1}. ${tokens[i]}`);
      expect(rule).toContain(outcomes[i]);
    });
    expect(rules[0]).toContain("corrupted evidence, authority failure");
    expect(rules[2]).toContain("missing required non-assessment evidence");
    expect(rules[2]).toContain("Validation Assessment INSUFFICIENT_EVIDENCE");
    expect(compact(rules[3])).toContain("ROBUSTNESS_DEGRADED or ROBUSTNESS_UNSTABLE");
    expect(rules[3]).toContain("Validation Assessment FAIL");
    expect(rules[4]).toContain("Validation Assessment PASS");
    expect(rules[4]).toContain("ROBUSTNESS_STABLE");
    expect(rules[4]).toContain("every required RL-8 gate is PASS");
    expect(compact(section("Decision Precedence"))).toContain("The first applicable rule wins");
    expect(table).not.toContain("accepted Validation Result explicitly fails");
    expect(table).not.toContain("accepted Validation Result passes");
  });

  it("materializes literal canonical protocol arrays without placeholders", () => {
    const payload = block("Scientific Promotion Protocol Payload");
    for (const placeholder of [
      "stateVocabulary: byte-sorted array",
      "gateVocabulary: byte-sorted array",
      "gateStatusVocabulary: byte-sorted array",
      "reasonVocabulary: byte-sorted array",
      "transitionGraph: byte-sorted array",
    ]) expect(payload).not.toContain(placeholder);
    expect(protocolArray("stateVocabulary")).toEqual([
      "DRAFT_RESEARCH", "EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE",
      "REJECTED", "SUPERSEDED", "VALIDATION_FAILED", "VALIDATION_PASSED",
    ]);
    expect(protocolArray("gateVocabulary")).toEqual([
      "GATE_ACCEPTED_EXECUTION_RESULT",
      "GATE_AUTHORITY_AND_TENANCY",
      "GATE_EVIDENCE_COMPLETENESS",
      "GATE_EVIDENCE_OBJECT_BINDING",
      "GATE_LINEAGE_INTEGRITY",
      "GATE_METRIC_RESULT_SET_V2",
      "GATE_PROTOCOL_COMPATIBILITY",
      "GATE_RL7_ROBUSTNESS_COMPARISON",
      "GATE_SUBJECT_IDENTITY",
      "GATE_VALIDATION_ASSESSMENT",
      "GATE_VALIDATION_RESULT",
    ]);
    expect(protocolArray("gateStatusVocabulary")).toEqual([
      "FAIL", "INCOMPATIBLE_EVIDENCE", "INSUFFICIENT_EVIDENCE", "PASS", "UNAVAILABLE",
    ]);
    expect(protocolArray("reasonVocabulary")).toContain("MISSING_VALIDATION_ASSESSMENT_AUTHORITY");
    expect(protocolArray("reasonVocabulary")).toContain("AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY");
    expect(protocolArray("reasonVocabulary")).toContain("INCOMPATIBLE_VALIDATION_ASSESSMENT");
    expect(protocolArray("transitionGraph")).toEqual(transitionGraph(contract));
    expect(protocolArray("requiredEvidenceClasses")).toContain("VALIDATION_ASSESSMENT_RESULT");
  });

  it("binds the complete exact evidence selectors for all eleven gates into the protocol", () => {
    const mapping = protocolArray("gateEvidenceMapping") as Array<{ gateId: string; selectors: string[] }>;
    const subject = ["subject.subjectExperiment", "subject.subjectExperimentParameters", "subject.subjectResearchIr"];
    const snapshot = [
      "evidenceSnapshot.evidenceObject", "evidenceSnapshot.metricResultSet", "evidenceSnapshot.result",
      "evidenceSnapshot.robustnessComparisonProtocol", "evidenceSnapshot.robustnessComparisonResult",
      "evidenceSnapshot.runInput", "evidenceSnapshot.validationAssessmentProtocol",
      "evidenceSnapshot.validationAssessmentResult", "evidenceSnapshot.validationProtocol",
      "evidenceSnapshot.validationResult",
    ];
    expect(mapping).toEqual([
      { gateId: "GATE_ACCEPTED_EXECUTION_RESULT", selectors: ["evidenceSnapshot.result", "evidenceSnapshot.runInput"] },
      { gateId: "GATE_AUTHORITY_AND_TENANCY", selectors: [] },
      { gateId: "GATE_EVIDENCE_COMPLETENESS", selectors: snapshot },
      { gateId: "GATE_EVIDENCE_OBJECT_BINDING", selectors: ["evidenceSnapshot.evidenceObject"] },
      { gateId: "GATE_LINEAGE_INTEGRITY", selectors: [...snapshot, ...subject] },
      { gateId: "GATE_METRIC_RESULT_SET_V2", selectors: ["evidenceSnapshot.metricResultSet"] },
      { gateId: "GATE_PROTOCOL_COMPATIBILITY", selectors: [
        "evidenceSnapshot.metricResultSet", "evidenceSnapshot.result",
        "evidenceSnapshot.robustnessComparisonProtocol", "evidenceSnapshot.validationAssessmentProtocol",
        "evidenceSnapshot.validationAssessmentResult", "evidenceSnapshot.validationProtocol", "transition.protocol",
      ] },
      { gateId: "GATE_RL7_ROBUSTNESS_COMPARISON", selectors: [
        "evidenceSnapshot.robustnessComparisonProtocol", "evidenceSnapshot.robustnessComparisonResult",
      ] },
      { gateId: "GATE_SUBJECT_IDENTITY", selectors: subject },
      { gateId: "GATE_VALIDATION_ASSESSMENT", selectors: [
        "evidenceSnapshot.validationAssessmentProtocol", "evidenceSnapshot.validationAssessmentResult",
      ] },
      { gateId: "GATE_VALIDATION_RESULT", selectors: ["evidenceSnapshot.validationProtocol", "evidenceSnapshot.validationResult"] },
    ]);
    const byteSort = (values: string[]) => [...values].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    const gateIds = mapping.map(({ gateId }) => gateId);
    expect(gateIds).toEqual(byteSort(block("Promotion Eligibility Gates").split("\n")));
    for (const { selectors } of mapping) expect(selectors).toEqual(byteSort([...new Set(selectors)]));
    const rules = compact(section("Deterministic Gate Evidence Mapping"));
    for (const rule of [
      "part of the protocol canonical preimage",
      "discard explicit null values only, deduplicate equal canonical HashRef envelopes",
      "sort the remaining envelopes by their exact canonical bytes using unsigned byte order",
      "No extra evidence HashRef may be attached; no non-null mapped HashRef may be omitted",
      "Same canonical subject + snapshot + protocol MUST produce identical gate evidence arrays",
      "Different gate evidence arrays for those same inputs are malformed and fail closed",
      "Root gates remain []; Stage B and lifecycle copy predecessor gates exactly",
    ]) expect(rules).toContain(rule);
    expect(block("Transition Artifact Payload")).toContain("determined exactly by protocol.gateEvidenceMapping");
  });

});
