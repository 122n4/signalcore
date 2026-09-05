import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const sqlDir = path.join(repoRoot, "docs", "investing-genesis", "sql");
const i3cPath = path.join(sqlDir, "I3C_ATOMIC_FILL_ACCOUNTING_CANDIDATE.sql");
const i4bPath = path.join(sqlDir, "I4B_PLAN_PERSISTENCE_CANDIDATE.sql");

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Investing Genesis I4-B policy fingerprint contract", () => {
  it("fingerprints semantic markers that exist in accepted canonical I3-C policies", () => {
    const i3c = normalize(fs.readFileSync(i3cPath, "utf8"));
    const i4b = normalize(fs.readFileSync(i4bPath, "utf8"));

    for (const marker of [
      "i3_accounting_write",
      "i3_internal_paper_fill_accounting_v1",
      "source_sequence",
      "material_request_hash",
      "disposal_fifo_v1",
      "supersedes_accounting_revision_id",
      "accounting_revision_id",
      "ledger_transaction_id",
      "settlement_currency",
      "account_access",
    ]) {
      expect(i3c).toContain(marker);
      expect(i4b).toContain(marker);
    }

    expect(i4b).not.toContain("expr.check_expr ~ 'pending'");
    expect(i4b).not.toContain("expr.check_expr ~ 'event_count'");
    expect(i4b).not.toContain("expr.check_expr ~ 'event_set_hash'");
    expect(i4b).not.toContain("expr.check_expr ~ 'securities_book_cost_asset'");
    expect(i4b).not.toContain("expr.check_expr ~ 'trading_fee_expense'");
    expect(i4b).not.toContain("expr.check_expr ~ 'realized_gain_loss'");
    expect(i4b).not.toContain("expr.check_expr ~ 'ledger_transactions'");
    expect(i4b).not.toContain("expr.check_expr ~ 'canonical_result_reference'");
  });
});
