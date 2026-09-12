import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "docs", "investing-genesis");

const removedDocs = [
  "I3A_IMPLEMENTATION_CHECKPOINT.md",
  "I3B_IMPLEMENTATION_CHECKPOINT.md",
  "I5A_RESEARCH_LAB_DOMAIN_DESIGN.md",
  "I5A_RESEARCH_LAB_DESIGN_DECISIONS_V1.md",
  "I5A_RESEARCH_LAB_DESIGN_AUDIT_AND_AMENDMENTS_V1.md",
  "I5A_RESEARCH_CANONICAL_TYPES_V1.md",
  "I5A_RESEARCH_IR_HASH_CONTRACT_V1.md",
  "I5A_AUTHORITY_SCOPE_CONTRACT_V1.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_V1.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V1.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V2.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V3.md",
  "I5A_CANONICAL_BYTES_HASH_PREIMAGES_V1.md",
  "I5A_CANONICAL_BYTES_HASH_PREIMAGES_AMENDMENT_V1.md",
] as const;

const requiredCurrentDocs = [
  "CANONICAL_CURRENT_STATE.md",
  "I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md",
  "I5A_CANONICAL_HASH_DOMAINS_V1.md",
  "I0_CONSTITUTION.md",
  "I1_AUTHORITY_DESIGN.md",
  "I1_DB_BOUNDARY_CONTRACT.md",
  "I2_LEDGER_DESIGN.md",
  "I3_ACCOUNTING_DESIGN.md",
  "I3_ACCOUNTING_DESIGN_FREEZE.md",
  "I4_PLAN_DESIGN.md",
  "I4B_CANONICAL_BYTES_CONTRACT.md",
  "I4B_PLAN_PERSISTENCE_DESIGN.md",
  "I4C_PLAN_WRITER_DESIGN.md",
  "I4C_RECONCILIATION.md",
  "I4_MASTER_CHECKPOINT.md",
  "I5_MATERIAL_COMMAND_IDENTITY_V1.md",
  "I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md",
] as const;

const scannedRoots = ["AGENTS.md", "docs", "lib", "tests", "package.json", "tsconfig.json"] as const;

function walk(relativePath: string): string[] {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [relativePath.replaceAll("\\", "/")];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") return [];
    if (entry.isDirectory()) return walk(child);
    if (entry.isFile()) return [child.replaceAll("\\", "/")];
    return [];
  });
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Investing Genesis canonical hygiene", () => {
  it("removes superseded active-tree documents and keeps current consolidated contracts", () => {
    for (const file of removedDocs) {
      expect(fs.existsSync(path.join(docsRoot, file)), file).toBe(false);
    }
    for (const file of requiredCurrentDocs) {
      expect(fs.existsSync(path.join(docsRoot, file)), file).toBe(true);
    }
  });

  it("keeps the Research Lab Build Spec as reference only", () => {
    const activeDocs = fs.readdirSync(docsRoot)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => read(path.join("docs", "investing-genesis", entry)))
      .join("\n");

    expect(activeDocs).toContain("is reference/blueprint only");
    expect(activeDocs).not.toMatch(/Build Spec[^.\n]*(authoritative|source specification authority|Source of Truth)/i);
    expect(activeDocs).not.toMatch(/authoritative[^.\n]*Build Spec/i);
  });

  it("preserves Core/Lab/Paper boundaries and the complete rehearsal model", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    expect(state).toContain("CORE != LAB");
    expect(state).toContain("LAB != PAPER");
    expect(state).toContain("A. `EXECUTION REHEARSAL`");
    expect(state).toContain("B. `CANONICAL INTEGRITY REHEARSAL`");
    expect(state).toContain("C. `REPOSITORY CONTROL PLANE`");
    expect(state).toContain("WHAT DID THIS SLICE SUPERSEDE?");
    expect(state).toContain("R0 -> R1 -> R2 -> R3 -> R4 -> R5 -> R6 -> R7");
    expect(state).not.toContain("R8");
    expect(state).not.toContain("R9");
  });

  it("does not leave deleted filenames as active authority references", () => {
    const allowedFiles = new Set([
      "docs/investing-genesis/CANONICAL_CURRENT_STATE.md",
      "tests/investingGenesisCanonicalHygiene.test.ts",
    ]);
    const textFiles = scannedRoots.flatMap((root) => walk(root))
      .filter((file) => /\.(?:md|ts|tsx|js|json|sql|cjs|mjs)$/u.test(file));

    for (const file of textFiles) {
      if (allowedFiles.has(file)) continue;
      const source = read(file);
      for (const removed of removedDocs) {
        expect(source.includes(removed), `${file} references ${removed}`).toBe(false);
      }
    }
  });

  it("keeps consolidated A3 and hash contracts tied to current runtime rather than future domains", () => {
    const a3 = read("docs/investing-genesis/I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md");
    expect(a3).toContain("Draft and Hypothesis are independent sibling roots");
    expect(a3).toContain("ResearchSpec binds the exact Draft and optional Hypothesis dependency");
    expect(a3).toContain("No DatasetSnapshot, Run, Result");

    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    expect(hash).toContain("Runtime truth is `lib/investing/research/canonical.ts`");
    expect(hash).toContain("`SYNTRAKE:RESEARCH_SPEC:V1` | `DECLARED_BUT_HASHING_DISABLED`");
    expect(hash).toContain("ResearchSpec remains `CANDIDATE_ONLY`");
    expect(hash).toContain("not as a fake SHA-256 scientific content digest");
  });
});
