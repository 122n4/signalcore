import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const repairPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I3C_BUY_AUDIT_NULL_REPAIR_CANDIDATE.sql",
);
const sourcePath = path.join(repoRoot, "lib", "investing", "accounting", "syntheticFill.ts");

function readFile(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeSql(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function policySlice(sql: string, policyName: string) {
  const normalized = normalizeSql(sql);
  const marker = `create policy ${policyName.toLowerCase()}`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const next = normalized.indexOf("create policy ", start + marker.length);
  const reset = normalized.indexOf(" reset role", start + marker.length);
  const candidates = [next, reset].filter((index) => index >= 0);
  const end = candidates.length === 0 ? normalized.length : Math.min(...candidates);
  return normalized.slice(start, end);
}

describe("Investing Genesis I3-C BUY audit-null repair candidate", () => {
  it("is source-only and pins the exact repaired branch lineage plus canonical I3-C blob", () => {
    const raw = readFile(repairPath);

    expect(raw).toContain("SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.");
    expect(raw).toContain("Canonical base commit: 216333245a9e4fb00f7b13f5259ec1f1fef0b31d");
    expect(raw).toContain("Required I3-C blob:   b403a869b26e93279552c5ea6d795f1d89061292");
    expect(raw).not.toContain("trading.");
  });

  it("matches the writer's canonical BUY null evidence instead of inventing an empty-string sentinel", () => {
    const source = readFile(sourcePath);
    const policy = policySlice(readFile(repairPath), "audit_events_i3c_buy_null_revision_insert");

    expect(source).toContain("let accountingRevisionId: string | null = null;");
    expect(source).toContain("accounting_revision_id: accountingRevisionId");
    expect(policy).toContain("current_setting('syntrake.investing.fill_side', true) = 'buy'");
    expect(policy).toContain("nullif(current_setting('syntrake.investing.accounting_revision_id', true), '') is null");
    expect(policy).toContain("evidence ? 'accounting_revision_id'");
    expect(policy).toContain("evidence -> 'accounting_revision_id' = 'null'::jsonb");
    expect(policy).not.toContain("evidence ->> 'accounting_revision_id' = ''");
  });

  it("cannot authorize SELL and requires an exact sealed BUY ledger effect", () => {
    const policy = policySlice(readFile(repairPath), "audit_events_i3c_buy_null_revision_insert");

    expect(policy).toContain("f.side = 'buy'");
    expect(policy).toContain("lt.transaction_kind = 'i3_internal_paper_buy_v1'");
    expect(policy).toContain("lt.i3_accounting_revision_id is null");
    expect(policy).toContain("join investing.ledger_transaction_seals lts");
    expect(policy).not.toContain("i3_internal_paper_sell_v1");
  });

  it("keeps full persisted authority evidence and does not grant shared access", () => {
    const raw = readFile(repairPath);
    const policy = policySlice(raw, "audit_events_i3c_buy_null_revision_insert");

    for (const proof of [
      "from investing.account_access aa",
      "join investing.tenant_memberships tm",
      "join investing.accounts a",
      "join investing.tenants t",
      "join investing.principals p",
      "aa.role = 'owner'",
      "aa.state = 'active'",
      "tm.role = 'owner'",
      "tm.state = 'active'",
      "a.state = 'active'",
      "t.state = 'active'",
      "p.state = 'active'",
      "p.external_provider = current_setting('syntrake.investing.external_provider', true)",
      "p.external_subject = current_setting('syntrake.investing.external_subject', true)",
    ]) {
      expect(policy, proof).toContain(proof);
    }

    expect(raw).not.toMatch(/grant\s+.*\s+to\s+(public|anon|authenticated|service_role)/i);
    expect(raw).not.toMatch(/security\s+definer/i);
  });
});
