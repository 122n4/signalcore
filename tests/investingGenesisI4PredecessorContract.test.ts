import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const sqlDir = path.join(repoRoot, "docs", "investing-genesis", "sql");
const i3aPath = path.join(sqlDir, "I3A_ACCOUNTING_FOUNDATIONS_CANDIDATE.sql");
const i3bPath = path.join(sqlDir, "I3B_LEDGER_LINEAGE_CANDIDATE_V3.sql");
const i3cPath = path.join(sqlDir, "I3C_ATOMIC_FILL_ACCOUNTING_CANDIDATE.sql");
const i4bPath = path.join(sqlDir, "I4B_PLAN_PERSISTENCE_CANDIDATE.sql");

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function functionSlice(sql: string, functionName: string) {
  const lower = sql.toLowerCase();
  const replaceMarker = `create or replace function investing.${functionName.toLowerCase()}()`;
  const createMarker = `create function investing.${functionName.toLowerCase()}()`;
  const replaceStart = lower.lastIndexOf(replaceMarker);
  const createStart = lower.lastIndexOf(createMarker);
  const start = Math.max(replaceStart, createStart);
  expect(start, `${functionName} definition missing`).toBeGreaterThanOrEqual(0);
  const end = lower.indexOf("$$;", start);
  expect(end, `${functionName} terminator missing`).toBeGreaterThan(start);
  return normalize(sql.slice(start, end + 3));
}

describe("Investing Genesis I4-B canonical predecessor contract", () => {
  it("proves the I4-B declarative gate against constraints that exist in canonical I3 source", () => {
    const i3a = normalize(read(i3aPath));
    const i3b = normalize(read(i3bPath));
    const i4b = normalize(read(i4bPath));

    const i3aConstraints = [
      "i3_fills_operation_check",
      "i3_fills_idempotency_material_fk",
      "i3_accounting_revisions_disposal_fill_fk",
      "i3_accounting_revision_seals_one_per_revision_key",
    ];
    const i3bConstraints = [
      "ledger_transactions_i3_fill_fk",
      "ledger_transactions_i3_accounting_revision_fk",
      "ledger_transactions_i3_lineage_shape_check",
    ];

    for (const constraint of i3aConstraints) {
      expect(i3a).toContain(constraint);
      expect(i4b).toContain(constraint);
    }
    for (const constraint of i3bConstraints) {
      expect(i3b).toContain(constraint);
      expect(i4b).toContain(constraint);
    }

    expect(i3a).toContain("check (operation = 'i3_internal_paper_fill_accounting_v1')");
    expect(i3a).toContain("references investing.idempotency_records");
    expect(i3a).toContain("references investing.i3_fills (fill_id, tenant_id, account_id, instrument_id)");
    expect(i3b).toContain("references investing.i3_fills");
    expect(i3b).toContain("references investing.i3_accounting_revisions");
    expect(i4b).toContain("accepted i3 declarative operation/lineage contract missing or drifted");
  });

  it("uses semantic markers that are present in the exact canonical predecessor function definitions", () => {
    const i3a = read(i3aPath);
    const i3b = read(i3bPath);
    const i3c = read(i3cPath);
    const i4b = normalize(read(i4bPath));

    const expectations = [
      {
        source: functionSlice(i3c, "i3_fill_insert_guard"),
        markers: [
          "complete canonical accounting genesis anchor",
          "canonical started idempotency material tuple",
          "active canonical authority graph",
        ],
      },
      {
        source: functionSlice(i3a, "i3_accounting_revision_insert_guard"),
        markers: [
          "canonical sell fill",
          "current sealed canonical leaf",
          "root accounting revision cannot supersede a nonexistent canonical leaf",
        ],
      },
      {
        source: functionSlice(i3c, "i3_accounting_revision_seal_guard"),
        markers: [
          "incomplete sell allocation reconciliation",
          "canonical event_count and event_set_hash evidence",
          "supersedes_accounting_revision_id is null",
        ],
      },
      {
        source: functionSlice(i3a, "i3_revision_commit_guard"),
        markers: [
          "i3_accounting_revision_seals",
          "v_seal_count <> 1",
          "cannot commit without exactly one immutable seal",
        ],
      },
      {
        source: functionSlice(i3c, "i3_fill_accounting_effect_commit_guard"),
        markers: [
          "sealed canonical ledger effect",
          "ledger_transaction_seals",
          "i3_accounting_revision_seals",
        ],
      },
      {
        source: functionSlice(i3b, "i3_ledger_transaction_lineage_guard"),
        markers: [
          "cannot resolve canonical fill lineage",
          "material lineage does not exactly match canonical fill",
          "requires exactly one immutable seal on the referenced root accountingrevision",
        ],
      },
      {
        source: functionSlice(i3c, "i2_ledger_seal_guard"),
        markers: [
          "initial_paper_cash_funding",
          "i3_internal_paper_buy_v1",
          "i3_internal_paper_sell_v1",
          "negative cash",
        ],
      },
    ];

    for (const { source, markers } of expectations) {
      for (const marker of markers) {
        expect(source).toContain(marker);
        expect(i4b).toContain(marker);
      }
    }
  });

  it("does not resurrect the four disproven body-string requirements", () => {
    const i4b = normalize(read(i4bPath));

    expect(i4b).not.toContain("fill tuple is not canonical");
    expect(i4b).not.toContain("accounting revision instrument tuple");
    expect(i4b).not.toContain("requires exactly one immutable accounting revision seal");
    expect(i4b).not.toContain("i3 internal paper fill accounting");

    expect(i4b).toContain("i3_fills_operation_check");
    expect(i4b).toContain("ledger_transactions_i3_lineage_shape_check");
    expect(i4b).toContain("material lineage does not exactly match canonical fill");
  });
});
