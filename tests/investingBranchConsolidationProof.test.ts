import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Investing branch consolidation proof", () => {
  it("retires the obsolete branch-specific I4-C workflow", () => {
    expect(
      fs.existsSync(path.join(repoRoot, ".github", "workflows", "i4c-reconciliation-static.yml")),
    ).toBe(false);
  });

  it("keeps accepted A3, A4 and A5 authority in the canonical tree", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(state).toContain("I5-A3 material revisions: current accepted and consolidated");
    expect(state).toContain("I5-A4 ResearchSpec persistence: current accepted");
    expect(state).toContain("CURRENT_ACCEPTED / TRUST_RECOVERY_CLOSED");
    expect(state).toContain("SUPERSEDED_UNACCEPTED_CANDIDATE");
    expect(state).toContain("2e88cde07e2f38dfc455e0a928adb709474f8af7");
  });

  it("admits Experiment BASELINE structurally without promoting Experiment scientific hashing", () => {
    const hashDomains = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const a5 = read("docs/investing-genesis/I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md");
    const experiment = read("docs/investing-genesis/I5_EXPERIMENT_BASELINE_ADMISSION_OWNER_CONTRACT_V1.md");
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const barrel = read("lib/investing/research/index.ts");

    expect(hashDomains).toContain(
      "`SYNTRAKE:EXPERIMENT:V1` | `DECLARED_BUT_HASHING_DISABLED`",
    );
    expect(a5).toContain("Experiment, DatasetSnapshot, MetricRequestSet, ExecutionConfig, Result, EvidenceObject admission");
    expect(experiment).toContain("Status: CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT BASELINE (UNNUMBERED)");
    expect(state).toContain("I5 Experiment BASELINE structural admission: current accepted, unnumbered,");
    expect(state).toContain("CURRENT_ACCEPTED / STRUCTURAL_RUNTIME_ONLY");
    expect(barrel).not.toContain("hashExperimentV1");
  });
});
