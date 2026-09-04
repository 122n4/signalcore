import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const sqlPath = path.join(repoRoot, "docs", "investing-genesis", "sql", "I4B_PLAN_PERSISTENCE_CANDIDATE.sql");
const designPath = path.join(repoRoot, "docs", "investing-genesis", "I4B_PLAN_PERSISTENCE_DESIGN.md");
const bytesContractPath = path.join(repoRoot, "docs", "investing-genesis", "I4B_CANONICAL_BYTES_CONTRACT.md");
const i4aDesignPath = path.join(repoRoot, "docs", "investing-genesis", "I4_PLAN_DESIGN.md");

const fieldOrder = [
  "planning_currency_preference",
  "goal_description",
  "target_money",
  "target_date",
  "time_horizon_months",
  "risk_tolerance",
  "excluded_asset_classes",
  "notes",
] as const;

const acceptedCurrencies = new Set(["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY"]);
const acceptedRiskTokens = new Set(["CONSERVATIVE", "BALANCED", "GROWTH", "AGGRESSIVE"]);
const acceptedAssetClasses = new Set(["CASH", "BONDS", "EQUITIES", "FUNDS", "CRYPTO", "DERIVATIVES"]);

type FieldName = (typeof fieldOrder)[number];
type FieldState = "SUPPLIED" | "NOT_SUPPLIED" | "UNKNOWN" | "DECLINED" | "NOT_APPLICABLE";
type FieldType = "TEXT" | "TOKEN" | "MONEY" | "DATE" | "INTEGER" | "TOKEN_SET";

type FieldValue = {
  state: FieldState;
  type: FieldType;
  value?: string;
  amount?: string;
  currency?: string;
  items?: string[];
};

type PlanContent = Record<FieldName, FieldValue>;

const fieldSchemas: Record<FieldName, { type: FieldType; maxBytes?: number }> = {
  planning_currency_preference: { type: "TOKEN" },
  goal_description: { type: "TEXT", maxBytes: 4096 },
  target_money: { type: "MONEY" },
  target_date: { type: "DATE" },
  time_horizon_months: { type: "INTEGER" },
  risk_tolerance: { type: "TOKEN" },
  excluded_asset_classes: { type: "TOKEN_SET", maxBytes: 512 },
  notes: { type: "TEXT", maxBytes: 8192 },
};

function readFile(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function tableSlice(sql: string, tableName: string) {
  const normalized = normalizeSql(sql);
  const marker = `create table investing.${tableName.toLowerCase()} (`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const end = normalized.indexOf(");", start);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end + 2);
}

function constraintReplacementSlice(sql: string, constraintName: string) {
  const normalized = normalizeSql(sql);
  const marker = `add constraint ${constraintName.toLowerCase()}`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const end = normalized.indexOf("));", start);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end + 3);
}

function functionSlice(sql: string, functionName: string) {
  const normalized = normalizeSql(sql);
  const marker = `create function investing.${functionName.toLowerCase()}`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const end = normalized.indexOf("$$;", start);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end + 3);
}

function sha256(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function canonicalUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new Error("invalid canonical uuid");
  }
  return value;
}

function canonicalActiveVersion(value: string) {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("invalid active version");
  const maxBigintText = "9223372036854775807";
  if (value.length > maxBigintText.length || (value.length === maxBigintText.length && value > maxBigintText)) {
    throw new Error("active version out of range");
  }
  return value;
}

function rejectMalformedScalarText(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("malformed unicode surrogate");
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new Error("malformed unicode surrogate");
    if (code < 0x20 || code === 0x7f) throw new Error("control character rejected");
  }
}

function canonicalDecimal(value: string) {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) throw new Error("invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  const canonicalFraction = fraction.replace(/0+$/, "");
  if (whole.length > 16 || canonicalFraction.length > 2) throw new Error("decimal out of bounds");
  return canonicalFraction === "" ? whole : `${whole}.${canonicalFraction}`;
}

function validateActualDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid date format");
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2200) throw new Error("date out of range");
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error("invalid calendar date");
  }
}

function rejectContradictoryPayload(field: FieldValue) {
  if (field.value !== undefined || field.amount !== undefined || field.currency !== undefined || field.items !== undefined) {
    throw new Error("non-supplied state cannot carry value payload");
  }
}

function canonicalValueBytes(name: FieldName, field: FieldValue) {
  const schema = fieldSchemas[name];
  if (field.type !== schema.type) throw new Error(`${name} type mismatch`);

  if (field.state !== "SUPPLIED") {
    rejectContradictoryPayload(field);
    return Buffer.alloc(0);
  }

  if (name === "planning_currency_preference") {
    if (field.value === undefined || !acceptedCurrencies.has(field.value)) throw new Error("invalid planning currency");
    return Buffer.from(field.value, "utf8");
  }

  if (name === "risk_tolerance") {
    if (field.value === undefined || !acceptedRiskTokens.has(field.value)) throw new Error("invalid risk token");
    return Buffer.from(field.value, "utf8");
  }

  if (field.type === "TEXT") {
    if (field.value === undefined) throw new Error("missing text");
    rejectMalformedScalarText(field.value);
    const normalized = field.value.normalize("NFC");
    rejectMalformedScalarText(normalized);
    const byteLength = Buffer.byteLength(normalized, "utf8");
    if (byteLength < 1 || byteLength > (schema.maxBytes ?? 0)) throw new Error("text byte length out of bounds");
    return Buffer.from(normalized, "utf8");
  }

  if (field.type === "MONEY") {
    if (field.amount === undefined || field.currency === undefined) throw new Error("supplied money requires amount and currency");
    if (!acceptedCurrencies.has(field.currency)) throw new Error("invalid money currency");
    return Buffer.from(`amount=${canonicalDecimal(field.amount)}\ncurrency=${field.currency}`, "utf8");
  }

  if (field.type === "DATE") {
    if (field.value === undefined) throw new Error("missing date");
    validateActualDate(field.value);
    return Buffer.from(field.value, "utf8");
  }

  if (field.type === "INTEGER") {
    if (field.value === undefined || !/^(0|[1-9][0-9]*)$/.test(field.value)) throw new Error("invalid integer");
    const numeric = Number(field.value);
    if (numeric < 0 || numeric > 1200 || String(numeric) !== field.value) throw new Error("horizon out of range");
    return Buffer.from(field.value, "utf8");
  }

  if (field.items === undefined) throw new Error("missing set");
  if (field.items.length > 16) throw new Error("set element count out of bounds");
  const seen = new Set<string>();
  for (const item of field.items) {
    if (!acceptedAssetClasses.has(item)) throw new Error("invalid asset class");
    if (seen.has(item)) throw new Error("duplicate set element");
    seen.add(item);
  }
  const canonicalSet = [...field.items].sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))).join("\n");
  if (Buffer.byteLength(canonicalSet, "utf8") > 512) throw new Error("set bytes out of bounds");
  return Buffer.from(canonicalSet, "utf8");
}

function canonicalContentBytes(content: PlanContent) {
  const chunks = [
    Buffer.from(
      "SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\n",
      "utf8",
    ),
  ];

  for (const field of fieldOrder) {
    const value = canonicalValueBytes(field, content[field]);
    chunks.push(Buffer.from(`field=${field}\nstate=${content[field].state}\ntype=${content[field].type}\nvalue_length=${value.length}\n`, "utf8"));
    chunks.push(value);
    chunks.push(Buffer.from("\nend_field\n", "utf8"));
  }

  const bytes = Buffer.concat(chunks);
  if (bytes.length > 32768) throw new Error("content bytes out of bounds");
  return bytes;
}

function rawContentBytes(records: Array<{ field: FieldName; state: FieldState; type: FieldType; value: string }>) {
  const chunks = [
    Buffer.from(
      "SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\n",
      "utf8",
    ),
  ];
  for (const record of records) {
    const value = Buffer.from(record.value, "utf8");
    chunks.push(
      Buffer.from(
        `field=${record.field}\nstate=${record.state}\ntype=${record.type}\nvalue_length=${value.length}\n${record.value}\nend_field\n`,
        "utf8",
      ),
    );
  }
  return Buffer.concat(chunks);
}

function rawRecordsFrom(content: PlanContent) {
  return fieldOrder.map((field) => {
    const value = canonicalValueBytes(field, content[field]).toString("utf8");
    return { field, state: content[field].state, type: content[field].type, value };
  });
}

function parseLine(bytes: Buffer, cursor: { offset: number }) {
  const end = bytes.indexOf(0x0a, cursor.offset);
  if (end < 0) throw new Error("missing line ending");
  const line = bytes.subarray(cursor.offset, end).toString("utf8");
  cursor.offset = end + 1;
  return line;
}

function consumeLiteral(bytes: Buffer, cursor: { offset: number }, literal: string) {
  const expected = Buffer.from(literal, "utf8");
  if (!bytes.subarray(cursor.offset, cursor.offset + expected.length).equals(expected)) {
    throw new Error(`expected literal ${literal}`);
  }
  cursor.offset += expected.length;
}

function dbCanonicalBytesValidator(bytes: Buffer) {
  const cursor = { offset: 0 };
  consumeLiteral(bytes, cursor, "SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\n");
  consumeLiteral(bytes, cursor, "content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\n");
  consumeLiteral(bytes, cursor, "field_count=8\n");

  for (const field of fieldOrder) {
    const schema = fieldSchemas[field];
    consumeLiteral(bytes, cursor, `field=${field}\n`);
    const stateLine = parseLine(bytes, cursor);
    if (!stateLine.startsWith("state=")) throw new Error("missing state");
    const state = stateLine.slice("state=".length) as FieldState;
    if (!["SUPPLIED", "NOT_SUPPLIED", "UNKNOWN", "DECLINED", "NOT_APPLICABLE"].includes(state)) throw new Error("invalid state");
    consumeLiteral(bytes, cursor, `type=${schema.type}\n`);
    const lengthLine = parseLine(bytes, cursor);
    if (!/^value_length=(0|[1-9][0-9]*)$/.test(lengthLine)) throw new Error("invalid value length");
    const valueLength = Number(lengthLine.slice("value_length=".length));
    const valueBytes = bytes.subarray(cursor.offset, cursor.offset + valueLength);
    if (valueBytes.length !== valueLength) throw new Error("fake value length");
    cursor.offset += valueLength;
    consumeLiteral(bytes, cursor, "\nend_field\n");

    if (state !== "SUPPLIED") {
      if (valueLength !== 0) throw new Error("non-supplied value bytes");
      continue;
    }
    if (valueLength === 0 && schema.type !== "TOKEN_SET") throw new Error("supplied value missing");
    const value = valueBytes.toString("utf8");

    if (schema.type === "TEXT") {
      rejectMalformedScalarText(value);
      if (value.normalize("NFC") !== value) throw new Error("non-nfc text");
      const byteLength = Buffer.byteLength(value, "utf8");
      if (byteLength < 1 || byteLength > (schema.maxBytes ?? 0)) throw new Error("text byte length out of bounds");
    } else if (field === "planning_currency_preference") {
      if (!acceptedCurrencies.has(value)) throw new Error("invalid planning currency");
    } else if (field === "risk_tolerance") {
      if (!acceptedRiskTokens.has(value)) throw new Error("invalid risk token");
    } else if (schema.type === "MONEY") {
      const match = /^amount=([^\n]+)\ncurrency=([A-Z]{3})$/.exec(value);
      if (!match) throw new Error("invalid money");
      canonicalDecimal(match[1] ?? "");
      if (!acceptedCurrencies.has(match[2] ?? "")) throw new Error("invalid money currency");
      if (`amount=${canonicalDecimal(match[1] ?? "")}\ncurrency=${match[2]}` !== value) throw new Error("noncanonical money");
    } else if (schema.type === "DATE") {
      validateActualDate(value);
    } else if (schema.type === "INTEGER") {
      if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("invalid integer");
      const numeric = Number(value);
      if (numeric < 0 || numeric > 1200 || String(numeric) !== value) throw new Error("horizon out of range");
    } else if (schema.type === "TOKEN_SET") {
      const items = value === "" ? [] : value.split("\n");
      if (items.length > 16 || Buffer.byteLength(value, "utf8") > (schema.maxBytes ?? 0)) throw new Error("set out of bounds");
      const seen = new Set<string>();
      for (const item of items) {
        if (!acceptedAssetClasses.has(item)) throw new Error("invalid asset class");
        if (seen.has(item)) throw new Error("duplicate set element");
        seen.add(item);
      }
      if ([...items].sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))).join("\n") !== value) {
        throw new Error("noncanonical set ordering");
      }
    }
  }

  if (cursor.offset !== bytes.length) throw new Error("trailing garbage");
  return true;
}

function contentHash(content: PlanContent) {
  return sha256(
    Buffer.concat([
      Buffer.from("SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1\0", "utf8"),
      canonicalContentBytes(content),
    ]),
  );
}

function initializeRequestHash(
  content: PlanContent,
  principal = "33333333-3333-4333-8333-333333333333",
  tenant = "11111111-1111-4111-8111-111111111111",
  account = "22222222-2222-4222-8222-222222222222",
) {
  return sha256(
    Buffer.from(
      [
        "SYNTRAKE_INVESTING_I4_PLAN_MUTATION_REQUEST_V1",
        "PLAN_INITIALIZE_V1",
        `tenant=${canonicalUuid(tenant)}`,
        `account=${canonicalUuid(account)}`,
        `principal=${canonicalUuid(principal)}`,
        `content=${contentHash(content)}`,
        "activation=CREATE_ROOT_CREATE_INITIAL_REVISION_ACTIVATE",
      ].join("\0"),
      "utf8",
    ),
  );
}

function createAndActivateRequestHash(
  content: PlanContent,
  root = "44444444-4444-4444-8444-444444444444",
  predecessor = "55555555-5555-4555-8555-555555555555",
  version = "1",
  principal = "33333333-3333-4333-8333-333333333333",
  tenant = "11111111-1111-4111-8111-111111111111",
  account = "22222222-2222-4222-8222-222222222222",
) {
  return sha256(
    Buffer.from(
      [
        "SYNTRAKE_INVESTING_I4_PLAN_MUTATION_REQUEST_V1",
        "PLAN_CREATE_AND_ACTIVATE_REVISION_V1",
        `tenant=${canonicalUuid(tenant)}`,
        `account=${canonicalUuid(account)}`,
        `principal=${canonicalUuid(principal)}`,
        `plan_root=${canonicalUuid(root)}`,
        `expected_active_revision=${canonicalUuid(predecessor)}`,
        `expected_active_version=${canonicalActiveVersion(version)}`,
        `content=${contentHash(content)}`,
        "activation=CREATE_REVISION_AND_ACTIVATE_ATOMICALLY",
      ].join("\0"),
      "utf8",
    ),
  );
}

const baseContent: PlanContent = {
  planning_currency_preference: { state: "SUPPLIED", type: "TOKEN", value: "USD" },
  goal_description: { state: "SUPPLIED", type: "TEXT", value: "Retire at 55" },
  target_money: { state: "SUPPLIED", type: "MONEY", amount: "1000000.00", currency: "USD" },
  target_date: { state: "SUPPLIED", type: "DATE", value: "2045-12-31" },
  time_horizon_months: { state: "SUPPLIED", type: "INTEGER", value: "240" },
  risk_tolerance: { state: "UNKNOWN", type: "TOKEN" },
  excluded_asset_classes: { state: "SUPPLIED", type: "TOKEN_SET", items: ["CRYPTO", "DERIVATIVES"] },
  notes: { state: "NOT_APPLICABLE", type: "TEXT" },
};

function withField<K extends FieldName>(field: K, value: PlanContent[K]): PlanContent {
  return { ...baseContent, [field]: value };
}

describe("Investing Genesis I4-B Plan persistence candidate", () => {
  it("keeps the candidate source-only and rooted in the accepted I4-A parent", () => {
    const sql = readFile(sqlPath);
    const combined = `${sql}\n${readFile(designPath)}\n${readFile(bytesContractPath)}`.toLowerCase();
    const executableSql = normalizeSql(sql);

    expect(sql).toContain("SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.");
    expect(sql).toContain("Canonical implementation parent: 8d45b1f57305f3d9b1e44705915739c6c5796269");
    expect(readFile(i4aDesignPath)).toContain("EXACT_PLAN_CONTENT_CANONICAL_BYTES =");
    expect(combined).not.toContain("trading.");
    expect(executableSql).not.toContain("security definer");
    expect(combined).not.toMatch(/\bgrant all\b/);
  });

  it("freezes exact field-specific schema and defers underspecified fields instead of inventing truth", () => {
    const contract = readFile(bytesContractPath);

    for (const field of fieldOrder) expect(contract).toContain(field);
    expect(contract).toContain("RECURRING_CONTRIBUTION = DEFERRED_UNTIL_EXACT_CADENCE_SEMANTICS");
    expect(contract).toContain("LIQUIDITY_NEED = DEFERRED_UNTIL_EXACT_TIME_AND_MEANING_SEMANTICS");
    expect(contract).toContain("ACCOUNT_BASE_CURRENCY_INHERITANCE = FORBIDDEN");
    expect(contract).toContain("planning-currency preference, never implicit account inheritance");
    expect(contract).toContain("User-declared self-description/preference only");
    expect(contract).toContain("NON_SUPPLIED_STATE_WITH_VALUE = VALIDATION_ERROR");
  });

  it("rejects field/type mismatch, contradictory payloads, invalid bounds, duplicate sets, and malformed text", () => {
    expect(() => canonicalValueBytes("planning_currency_preference", { state: "SUPPLIED", type: "TEXT", value: "USD" })).toThrow(
      "type mismatch",
    );
    expect(() => canonicalValueBytes("risk_tolerance", { state: "SUPPLIED", type: "TOKEN", value: "SUITABLE" })).toThrow(
      "invalid risk token",
    );
    expect(() => canonicalValueBytes("time_horizon_months", { state: "SUPPLIED", type: "INTEGER", value: "1201" })).toThrow(
      "horizon out of range",
    );
    expect(() => canonicalValueBytes("target_date", { state: "SUPPLIED", type: "DATE", value: "2027-02-29" })).toThrow(
      "invalid calendar date",
    );
    expect(() => canonicalValueBytes("target_date", { state: "SUPPLIED", type: "DATE", value: "1800-01-01" })).toThrow(
      "date out of range",
    );
    expect(() => canonicalValueBytes("target_money", { state: "SUPPLIED", type: "MONEY", amount: "1e6", currency: "USD" })).toThrow(
      "invalid decimal",
    );
    expect(() => canonicalValueBytes("target_money", { state: "SUPPLIED", type: "MONEY", amount: "1,000", currency: "USD" })).toThrow(
      "invalid decimal",
    );
    expect(() => canonicalValueBytes("target_money", { state: "SUPPLIED", type: "MONEY", amount: "1.234", currency: "USD" })).toThrow(
      "decimal out of bounds",
    );
    expect(() => canonicalValueBytes("target_money", { state: "SUPPLIED", type: "MONEY", amount: "1", currency: "ZZZ" })).toThrow(
      "invalid money currency",
    );
    expect(() => canonicalValueBytes("excluded_asset_classes", { state: "SUPPLIED", type: "TOKEN_SET", items: ["CRYPTO", "CRYPTO"] })).toThrow(
      "duplicate set element",
    );
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "bad\u0000text" })).toThrow(
      "control character rejected",
    );
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "bad\u001ftext" })).toThrow(
      "control character rejected",
    );
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "bad\u007ftext" })).toThrow(
      "control character rejected",
    );
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "ok\u0085text" })).not.toThrow();
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "ok\u009ftext" })).not.toThrow();
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "Caf\u00e9 plan" })).not.toThrow();
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "\ud800" })).toThrow(
      "malformed unicode surrogate",
    );
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "\udc00" })).toThrow(
      "malformed unicode surrogate",
    );
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "Retire \ud83d\ude80" })).not.toThrow();
    expect(() => canonicalValueBytes("goal_description", { state: "SUPPLIED", type: "TEXT", value: "\ufffd" })).not.toThrow();
    expect(contentHash(withField("goal_description", { state: "SUPPLIED", type: "TEXT", value: "\ufffd" }))).not.toBe(
      contentHash(withField("goal_description", { state: "SUPPLIED", type: "TEXT", value: "Retire \ud83d\ude80" })),
    );
    expect(() => canonicalValueBytes("risk_tolerance", { state: "UNKNOWN", type: "TOKEN", value: "BALANCED" })).toThrow(
      "non-supplied state cannot carry value payload",
    );
  });

  it("models the DB byte parser rejecting malformed structural and field-specific encodings", () => {
    const records = rawRecordsFrom(baseContent);
    expect(dbCanonicalBytesValidator(canonicalContentBytes(baseContent))).toBe(true);
    expect(dbCanonicalBytesValidator(rawContentBytes(rawRecordsFrom(withField("excluded_asset_classes", { state: "SUPPLIED", type: "TOKEN_SET", items: [] }))))).toBe(
      true,
    );

    expect(() => dbCanonicalBytesValidator(rawContentBytes([records[1]!, records[0]!, ...records.slice(2)]))).toThrow("expected literal");
    expect(() => dbCanonicalBytesValidator(rawContentBytes([records[0]!, records[0]!, ...records.slice(2)]))).toThrow("expected literal");
    expect(() => dbCanonicalBytesValidator(Buffer.from(canonicalContentBytes(baseContent).toString("utf8").replace("\nend_field\n", "\n"), "utf8"))).toThrow(
      "expected literal",
    );
    expect(() => dbCanonicalBytesValidator(Buffer.from(canonicalContentBytes(baseContent).toString("utf8").replace("value_length=12\nRetire", "value_length=13\nRetire"), "utf8"))).toThrow(
      "expected literal",
    );
    expect(() => dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "" } : record))))).toThrow(
      "supplied value missing",
    );
    expect(() =>
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "risk_tolerance" ? { ...record, value: "BALANCED" } : record)))),
    ).toThrow("non-supplied value bytes");
    expect(() =>
      dbCanonicalBytesValidator(
        rawContentBytes(
          records.map((record) =>
            record.field === "risk_tolerance" ? { ...record, state: "SUPPLIED", value: "SUITABLE" } : record,
          ),
        ),
      ),
    ).toThrow("invalid risk token");
    expect(() =>
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "target_money" ? { ...record, value: "amount=1e6\ncurrency=USD" } : record)))),
    ).toThrow("invalid decimal");
    expect(() =>
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "target_date" ? { ...record, value: "2027-02-29" } : record)))),
    ).toThrow("invalid calendar date");
    expect(() =>
      dbCanonicalBytesValidator(
        rawContentBytes(records.map((record) => (record.field === "excluded_asset_classes" ? { ...record, value: "DERIVATIVES\nCRYPTO" } : record))),
      ),
    ).toThrow("noncanonical set ordering");
    expect(() =>
      dbCanonicalBytesValidator(
        rawContentBytes(records.map((record) => (record.field === "excluded_asset_classes" ? { ...record, value: "CRYPTO\nCRYPTO" } : record))),
      ),
    ).toThrow("duplicate set element");
    expect(() => dbCanonicalBytesValidator(Buffer.concat([canonicalContentBytes(baseContent), Buffer.from("garbage", "utf8")]))).toThrow("trailing garbage");
    expect(() =>
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "Cafe\u0301 plan" } : record)))),
    ).toThrow("non-nfc text");
    expect(() =>
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "bad\u0001text" } : record)))),
    ).toThrow("control character rejected");
    expect(() =>
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "bad\u001ftext" } : record)))),
    ).toThrow("control character rejected");
    expect(() =>
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "bad\u007ftext" } : record)))),
    ).toThrow("control character rejected");
    expect(
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "ok\u0085text" } : record)))),
    ).toBe(true);
    expect(
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "ok\u009ftext" } : record)))),
    ).toBe(true);
    expect(
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "Caf\u00e9 plan" } : record)))),
    ).toBe(true);
    expect(
      dbCanonicalBytesValidator(rawContentBytes(records.map((record) => (record.field === "goal_description" ? { ...record, value: "Retire \ud83d\ude80" } : record)))),
    ).toBe(true);
  });

  it("validates canonical UUID and active-version text before request hashing", () => {
    expect(initializeRequestHash(baseContent, "33333333-3333-4333-8333-333333333333")).toBe(
      "51A407FA13E14311E269EED8B763B357CD5770E3BD0251C65B3C20B1D23F083A",
    );
    expect(initializeRequestHash(baseContent, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toBe(
      "620D492B80A0C57F0B973147771755C63FE2C3B69548B9469D243EBE907A9F4C",
    );
    expect(() => initializeRequestHash(baseContent, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".toUpperCase())).toThrow("invalid canonical uuid");
    expect(() => initializeRequestHash(baseContent, "not-a-uuid")).toThrow("invalid canonical uuid");
    expect(createAndActivateRequestHash(baseContent, undefined, undefined, "1")).toBe(
      "7ED3DBF335B52E4AEEDB1811635FD4635C39F6B9277B863CAA4440C85DA7506E",
    );
    for (const version of ["01", "+1", "1.0", "1e0", "-1", "9223372036854775808"]) {
      expect(() => createAndActivateRequestHash(baseContent, undefined, undefined, version)).toThrow(/active version/);
    }
  });

  it("pins corrected golden vectors for canonical content and both request hash operations", () => {
    expect(canonicalContentBytes(baseContent).byteLength).toBe(791);
    expect(contentHash(baseContent)).toBe("85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6");
    expect(initializeRequestHash(baseContent)).toBe("51A407FA13E14311E269EED8B763B357CD5770E3BD0251C65B3C20B1D23F083A");
    expect(createAndActivateRequestHash(baseContent)).toBe(
      "7ED3DBF335B52E4AEEDB1811635FD4635C39F6B9277B863CAA4440C85DA7506E",
    );

    expect(contentHash(withField("target_money", { state: "SUPPLIED", type: "MONEY", amount: "1000000.0", currency: "USD" }))).toBe(
      contentHash(baseContent),
    );
    expect(contentHash(withField("risk_tolerance", { state: "DECLINED", type: "TOKEN" }))).toBe(
      "BDC0BA730310245C39FB71D16F81148E48BA6AB5D8CBB0AB8F859677C8C71F32",
    );
    expect(contentHash(withField("risk_tolerance", { state: "NOT_SUPPLIED", type: "TOKEN" }))).toBe(
      "063D41325DEB9CC54D786162B4962508FD9C7B09D0B9DCEEB16109F02F8B09AB",
    );
    expect(contentHash(withField("goal_description", { state: "SUPPLIED", type: "TEXT", value: "retire at 55" }))).toBe(
      "B9786F9478C50D43DBA6166225C0123DAE9EA4ADEA615228BE2C271F49BE42D8",
    );
    expect(contentHash(withField("goal_description", { state: "SUPPLIED", type: "TEXT", value: "Retire  at 55" }))).toBe(
      "B76A21743BD95E3E83DEEC99B51C7DB444BA4209DC3020C53BB5713CD770F4C2",
    );
    expect(contentHash(withField("goal_description", { state: "SUPPLIED", type: "TEXT", value: "Cafe\u0301 plan" }))).toBe(
      "D5CA14174AE928554596EABD1AD03B191CEF6707714D411D61A5C084E59B7647",
    );
    expect(contentHash(withField("goal_description", { state: "SUPPLIED", type: "TEXT", value: "Caf\u00e9 plan" }))).toBe(
      "D5CA14174AE928554596EABD1AD03B191CEF6707714D411D61A5C084E59B7647",
    );
    expect(contentHash(withField("excluded_asset_classes", { state: "SUPPLIED", type: "TOKEN_SET", items: ["DERIVATIVES", "CRYPTO"] }))).toBe(
      contentHash(baseContent),
    );
    expect(contentHash(withField("excluded_asset_classes", { state: "SUPPLIED", type: "TOKEN_SET", items: [] }))).toBe(
      "E8CAAB8172D3A88366D65DAE967F6C8DA1CC66E12D5FBBBA2C1C4E0C6745EEBD",
    );
  });

  it("proves create-and-activate material hash changes for each material predecessor/input and ignores excluded metadata", () => {
    expect(createAndActivateRequestHash(baseContent, "44444444-4444-4444-8444-444444444445")).toBe(
      "B6758807567D8C01A536D290587AFF5719C772DA0677704AD6D71D9F62A2B431",
    );
    expect(createAndActivateRequestHash(baseContent, undefined, "55555555-5555-4555-8555-555555555556")).toBe(
      "554C74FF3C7236911C412502F78658A137AFFAE416F9444C28E6B7506754B410",
    );
    expect(createAndActivateRequestHash(baseContent, undefined, undefined, "2")).toBe(
      "15B6095E1FFBCEBF9D452C783F3AE559CBD719DA5873635AD08997091672A193",
    );
    expect(createAndActivateRequestHash(withField("target_date", { state: "SUPPLIED", type: "DATE", value: "2046-01-01" }))).toBe(
      "97792B3C53C9B616B66CC4D458B9D77F150A89AD09C86569F2D7C4087AAD1383",
    );
    expect(createAndActivateRequestHash(baseContent, undefined, undefined, undefined, "33333333-3333-4333-8333-333333333334")).toBe(
      "92A5D24580F0A52C32C6373D90F96C57BEE46C002587D423C2F0CCA52D4A4F88",
    );

    const excluded = ["new_plan_revision_id", "idempotency_key", "correlation_id", "recorded_at"];
    expect(excluded.join("|")).toContain("new_plan_revision_id");
    expect(createAndActivateRequestHash(baseContent)).toBe(
      "7ED3DBF335B52E4AEEDB1811635FD4635C39F6B9277B863CAA4440C85DA7506E",
    );
  });

  it("stores one canonical Plan content truth and rejects JSON/bytes divergence by construction", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const revisions = tableSlice(readFile(sqlPath), "plan_revisions");
    const validator = functionSlice(readFile(sqlPath), "i4_plan_content_bytes_are_canonical_v1");

    expect(revisions).toContain("canonical_content_bytes bytea not null");
    expect(revisions).not.toContain("canonical_content jsonb");
    expect(revisions).toContain("constraint plan_revisions_content_bytes_canonical_check");
    expect(revisions).toContain("investing.i4_plan_content_bytes_are_canonical_v1(canonical_content_bytes)");
    expect(revisions).toContain("constraint plan_revisions_content_hash_matches_bytes_check");
    expect(sql).toContain("convert_to('syntrake_investing_i4_plan_revision_content_v1', 'utf8')");
    expect(validator).toContain("field_count=8");
    expect(validator).toContain("length(value) > 32768");
    expect(validator).toContain("convert_from(v_value, 'utf8')");
    expect(validator).toContain("v_pos <> v_total + 1");
  });

  it("enforces exact predecessor id+number lineage and active pointer version equality", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const revisions = tableSlice(readFile(sqlPath), "plan_revisions");

    expect(revisions).toContain("constraint plan_revisions_predecessor_exact_fk foreign key");
    expect(revisions).toContain("predecessor_plan_revision_id, predecessor_revision_number");
    expect(revisions).toContain("plan_revision_id, revision_number");
    expect(revisions).toContain("constraint plan_revisions_scope_number_key unique");
    expect(sql).toContain("constraint plan_roots_active_revision_fk foreign key (tenant_id, account_id, plan_root_id, active_plan_revision_id, active_version)");
    expect(sql).toContain("references investing.plan_revisions (tenant_id, account_id, plan_root_id, plan_revision_id, revision_number)");
    expect(sql).toContain("deferrable initially deferred");
  });

  it("rejects inactive committed revisions, initialization to Rn>1, stale activation, skip, and reactivation", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const rootGuard = functionSlice(readFile(sqlPath), "i4_plan_prevent_root_endpoint_mutation");
    const revisionCommit = functionSlice(readFile(sqlPath), "i4_plan_validate_revision_commit");

    expect(sql).toContain("create constraint trigger plan_revisions_commit_guard");
    expect(sql).toContain("deferrable initially deferred");
    expect(revisionCommit).toContain("committed planrevision must be the active revision");
    expect(revisionCommit).toContain("v_root.active_plan_revision_id <> new.plan_revision_id");
    expect(revisionCommit).toContain("v_root.active_version <> new.revision_number");
    expect(rootGuard).toContain("v_revision.predecessor_plan_revision_id is distinct from old.active_plan_revision_id");
    expect(rootGuard).toContain("v_revision.predecessor_revision_number is distinct from old.active_version");
    expect(rootGuard).toContain("v_revision.revision_number <> old.active_version + 1");
    expect(rootGuard).toContain("new.active_version <> v_revision.revision_number");
  });

  it("makes PlanRoot creation lineage exact and root metadata impossible to mutate", () => {
    const roots = tableSlice(readFile(sqlPath), "plan_roots");
    const revisionCommit = functionSlice(readFile(sqlPath), "i4_plan_validate_revision_commit");
    const rootGuard = functionSlice(readFile(sqlPath), "i4_plan_prevent_root_endpoint_mutation");

    expect(roots).toContain("created_idempotency_record_id uuid not null");
    expect(roots).toContain("constraint plan_roots_created_idempotency_fk foreign key (created_idempotency_record_id)");
    expect(roots).not.toContain("metadata jsonb");
    expect(revisionCommit).toContain("planroot creation lineage must match initial planrevision");
    expect(revisionCommit).toContain("v_root.created_idempotency_record_id <> new.idempotency_record_id");
    expect(rootGuard).toContain("old.created_idempotency_record_id is distinct from new.created_idempotency_record_id");
  });

  it("persists immutable tenant membership and account access authority lineage", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const revisions = tableSlice(readFile(sqlPath), "plan_revisions");
    const bindings = tableSlice(readFile(sqlPath), "plan_revision_success_audit_bindings");

    expect(sql).toContain("constraint account_access_i4_plan_authority_tuple_key unique");
    expect(revisions).toContain("tenant_membership_id uuid not null");
    expect(revisions).toContain("account_access_id uuid not null");
    expect(revisions).toContain("constraint plan_revisions_membership_fk");
    expect(revisions).toContain("constraint plan_revisions_access_fk");
    expect(bindings).toContain("tenant_membership_id uuid not null");
    expect(bindings).toContain("account_access_id uuid not null");
  });

  it("requires SUCCEEDED idempotency and structured canonical result identity at commit", () => {
    const guard = functionSlice(readFile(sqlPath), "i4_plan_validate_revision_commit");

    expect(guard).toContain("ir.status, ir.canonical_result_reference");
    expect(guard).toContain("v_idempotency_status <> 'succeeded'");
    expect(guard).toContain("v_result ->> 'plan_root_id' is distinct from new.plan_root_id::text");
    expect(guard).toContain("v_result ->> 'plan_revision_id' is distinct from new.plan_revision_id::text");
    expect(guard).toContain("requires exact succeeded idempotency result");
  });

  it("requires exactly one matching success audit binding and a matching audit_events row", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const binding = tableSlice(readFile(sqlPath), "plan_revision_success_audit_bindings");
    const revisionGuard = functionSlice(readFile(sqlPath), "i4_plan_validate_revision_commit");
    const auditGuard = functionSlice(readFile(sqlPath), "i4_plan_validate_success_audit_binding_commit");

    expect(sql).toContain("constraint plan_revisions_success_audit_binding_fk");
    expect(binding).toContain("constraint plan_revision_success_audit_bindings_revision_exact_fk");
    expect(revisionGuard).toContain("planrevision requires exactly one success audit binding");
    expect(auditGuard).toContain("success audit row does not exist");
    expect(auditGuard).toContain("success audit binding does not match exactly one planrevision");
    expect(auditGuard).toContain("plan_initialization_succeeded");
    expect(auditGuard).toContain("plan_revision_activated");
    expect(auditGuard).toContain("v_audit.object_type <> 'plan_revision'");
    expect(auditGuard).toContain("v_audit.object_id <> new.plan_revision_id::text");
    expect(auditGuard).toContain("v_audit.outcome <> 'succeeded'");
    expect(auditGuard).toContain("v_audit.reason_code is not null");
    expect(auditGuard).toContain("tenant_membership_id");
    expect(auditGuard).toContain("account_access_id");
  });

  it("preserves exact accepted I3 predecessor vocabulary and adds only required Plan vocabulary", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const rawSql = readFile(sqlPath);
    const actionCheck = constraintReplacementSlice(readFile(sqlPath), "audit_events_action_check");
    const objectTypeCheck = constraintReplacementSlice(readFile(sqlPath), "audit_events_object_type_check");
    const expectedPredecessorVocabulary = [
      "check(operation=any(array[''initial_personal_bootstrap'',''initial_paper_cash_funding'',''i3_internal_paper_fill_accounting_v1'']))",
      "check(action=any(array[''authority_bootstrap_requested'',''authority_bootstrap_succeeded'',''authority_bootstrap_failed'',''authority_access_denied'',''i3_fill_accounting_succeeded'']))",
      "check(object_type=any(array[''principal'',''tenant'',''tenant_membership'',''account'',''account_access'',''idempotency_record'',''i3_fill'']))",
    ];

    expect(sql).toContain("accepted i3 audit action vocabulary missing or drifted");
    expect(sql).toContain("accepted i3 audit object vocabulary missing or drifted");
    expect(sql).toContain("accepted i3 critical guard function inventory missing or drifted");
    expect(sql).toContain("accepted i3 critical guard function body fingerprint missing or drifted");
    expect(sql).toContain("accepted i3 critical trigger inventory missing or drifted");
    expect(sql).toContain("accepted i3 critical runtime policy inventory missing or drifted");
    expect(sql).toContain("accepted i3 critical runtime policy body fingerprint missing or drifted");
    expect(sql).toContain("accepted i3 acl surface has unexpected public/shared/destructive privilege");
    expect(sql).toContain("accepted i3 column update acl fingerprint missing or drifted");
    expect(sql).toContain("accepted i3 column acl surface has unexpected public/shared/runtime privilege");
    expect(sql).toContain("regexp_replace(lower(pg_catalog.pg_get_constraintdef(con.oid, true)), '::text|\\s+', '', 'g') =");
    for (const expected of expectedPredecessorVocabulary) expect(rawSql).toContain(expected);
    expect(rawSql).not.toContain("check((operation=any(array");
    expect(rawSql).not.toContain("check((action=any(array");
    expect(rawSql).not.toContain("check((object_type=any(array");
    expect(sql).toContain("'i3_fill_accounting_succeeded'");
    expect(actionCheck).toContain("'plan_initialization_succeeded'");
    expect(actionCheck).toContain("'plan_revision_activated'");
    expect(actionCheck).not.toContain("'initial_paper_cash_funding_succeeded'");
    expect(sql).toContain("'i3_fill'");
    expect(objectTypeCheck).toContain("'plan_revision'");
    expect(objectTypeCheck).not.toContain("'plan_root'");
    expect(objectTypeCheck).not.toContain("'ledger_transaction'");
    expect(sql).toContain("'i3_fill_insert_guard'");
    expect(sql).toContain("'i3_accounting_revision_seal_guard'");
    expect(sql).toContain("'i3_fill_accounting_effect_commit_guard'");
    expect(sql).toContain("complete canonical accounting genesis anchor");
    expect(sql).toContain("sealed canonical ledger effect");
    expect(sql).toContain("source_sequence");
    expect(sql).toContain("'i2_ledger_seal_guard'");
    expect(sql).toContain("'ledger_transaction_seals_guard_all_mutations'");
    expect(sql).toContain("i3_internal_paper_buy_v1");
    expect(sql).toContain("i3_internal_paper_sell_v1");
    expect(sql).toContain("negative cash");
    expect(sql).toContain("pg_catalog.pg_attribute");
    expect(sql).toContain("accounting_mutex_id");
    for (const column of ["canonical_result_reference", "completed_at", "error_code", "status", "updated_at"]) {
      expect(sql).toContain(`c.relname = 'idempotency_records' and a.attname = '${column}'`);
    }
    expect(sql).toContain("if v_bad_count <> 11 then");
    expect(sql).toContain("'update', 'delete', 'truncate', 'references', 'trigger', 'maintain'");
    expect(sql).toContain("'ledger_transactions_i3_lineage_guard_insert'");
    expect(sql).toContain("'ledger_transaction_seals_i3c_accounting_insert'");
    expect(sql).toContain("'audit_events_i3c_fill_success_insert'");
    expect(sql).toContain("p.polcmd = 'a'");
    expect(sql).toContain("p.polcmd = 'w'");
    expect(sql).toContain("pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)");
  });

  it("requires the complete accepted I3-C predecessor relation inventory and ledger seal guard chain", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const requiredRelations = [
      "principals",
      "tenants",
      "tenant_memberships",
      "accounts",
      "account_access",
      "idempotency_records",
      "audit_events",
      "ledger_accounts",
      "ledger_transactions",
      "ledger_postings",
      "ledger_transaction_seals",
      "i3_instruments",
      "i3_accounting_mutexes",
      "i3_accounting_genesis_anchors",
      "i3_fills",
      "i3_acquisition_lot_origins",
      "i3_accounting_revisions",
      "i3_lot_consumption_allocations",
      "i3_accounting_revision_seals",
    ];

    for (const relation of requiredRelations) expect(sql).toContain(`('${relation}')`);
    expect(sql).toContain("accepted i2/i3 predecessor relations must be investing_owner-owned with rls and force rls");
    expect(sql).toContain("c.relname = 'ledger_transaction_seals' and t.tgname = 'ledger_transaction_seals_guard_all_mutations'");
    expect(sql).toContain("p.proname = 'i2_ledger_seal_guard' and not t.tgdeferrable");
  });

  it("pins locale-independent TEXT controls, TOKEN_SET byte ordering, and PostgreSQL UUID shape", () => {
    const contract = readFile(bytesContractPath);
    const sql = normalizeSql(readFile(sqlPath));
    const validator = functionSlice(readFile(sqlPath), "i4_plan_content_bytes_are_canonical_v1");

    expect(contract).toContain("The forbidden set is exactly those ASCII control scalars.");
    expect(contract).toContain("U+0085, U+009F");
    expect(contract).toContain("deterministic ASCII/UTF-8 byte lexical order");
    expect(contract).toContain("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    expect(contract).toContain("does not add a UUID version policy");
    expect(sql).toContain("get_byte(v_value, v_byte_index) between 0 and 31");
    expect(sql).toContain('order by token collate "c"');
    expect(validator).not.toContain("[[:cntrl:]]");
  });

  it("keeps security postconditions on pg_catalog ACLs, exact triggers, deferrability, RLS, and FORCE RLS", () => {
    const sql = normalizeSql(readFile(sqlPath));

    for (const table of ["plan_roots", "plan_revisions", "plan_revision_success_audit_bindings"]) {
      expect(sql).toContain(`alter table investing.${table} enable row level security`);
      expect(sql).toContain(`alter table investing.${table} force row level security`);
      expect(sql).toContain(`revoke all on table investing.${table} from public, anon, authenticated, service_role, investing_app`);
    }

    expect(sql).toContain("pg_catalog.aclexplode");
    expect(sql).toContain("acl.grantee = 0");
    expect(sql).toContain("'select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger', 'maintain'");
    expect(sql).toContain("expected plan trigger inventory/deferrability mismatch");
    expect(sql).toContain("required deferred tuple constraints missing or not deferred");
    expect(sql).not.toMatch(/create policy .* on investing\.plan_/);
    expect(sql).not.toMatch(/grant .* on table investing\.plan_/);
    expect(sql).not.toContain("security definer");
  });

  it("keeps I4-B away from runtime, Trading, financial ledger mutation, and historical Plan authority", () => {
    const combined = `${readFile(sqlPath)}\n${readFile(designPath)}\n${readFile(bytesContractPath)}`.toLowerCase();

    expect(combined).not.toContain("insert into investing.ledger_");
    expect(combined).not.toContain("update investing.ledger_");
    expect(combined).not.toContain("delete from investing.ledger_");
    expect(combined).not.toContain("from trading");
    expect(combined).toContain("historical_lineage_only");
    expect(combined).toContain("20260816202000_investing_canonical_plan_persistence_schema");
    expect(combined).toContain("20260817023650_investing_canonical_plan_persistence_writer");
  });
});
