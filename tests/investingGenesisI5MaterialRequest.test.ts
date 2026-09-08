import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vectors from "./fixtures/investingI5MaterialRequestV1.json";
import * as research from "../lib/investing/research";
import {
  draftRevisionCreateMaterialIdentityV1,
  hashHypothesisV1,
  hashResearchDraftV1,
  hypothesisRevisionCreateMaterialIdentityV1,
  investigationCreateMaterialIdentityV1,
  type DraftRevisionCreateMaterialRequestV1,
  type HypothesisRevisionCreateMaterialRequestV1,
  type InvestigationCreateMaterialRequestV1,
  type ResearchMaterialScopeEvidenceV1,
} from "../lib/investing/research";

const domain = "SYNTRAKE_INVESTING_I5_MATERIAL_COMMAND_REQUEST_V1";
const otherId = "abcdefab-1234-5678-9abc-def012345678";
const pure = vectors.vectors[0];
const scope = pure.scope as ResearchMaterialScopeEvidenceV1;
const investigation = pure.command as InvestigationCreateMaterialRequestV1;
type Command = InvestigationCreateMaterialRequestV1 | DraftRevisionCreateMaterialRequestV1 | HypothesisRevisionCreateMaterialRequestV1;

function calculate(evidence: unknown, command: unknown) {
  const operation = (command as Command).operation;
  if (operation === "RESEARCH_INVESTIGATION_CREATE_V1") return investigationCreateMaterialIdentityV1(evidence as never, command as never);
  if (operation === "RESEARCH_DRAFT_REVISION_CREATE_V1") return draftRevisionCreateMaterialIdentityV1(evidence as never, command as never);
  if (operation === "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1") return hypothesisRevisionCreateMaterialIdentityV1(evidence as never, command as never);
  throw new Error("fixture operation not admitted");
}

describe("I5 material command identity: independent fixed bytes", () => {
  it.each(vectors.vectors)("matches .NET golden $name", (vector) => {
    const result = calculate(vector.scope, vector.command);
    expect(result.preimageBytes).toEqual(Buffer.from(vector.preimageUtf8, "utf8"));
    expect(result.preimageBytes.length).toBe(vector.byteLength);
    expect(result.materialRequestHash).toBe(vector.hashHex);
    expect(result.materialRequestHash).toMatch(/^[0-9A-F]{64}$/);
    expect(createHash("sha256").update(result.preimageBytes).digest("hex").toUpperCase()).toBe(vector.hashHex);
    expect(calculate(structuredClone(vector.scope), structuredClone(vector.command))).toEqual(result);
    expect(result.preimageBytes[0]).toBe(83);
    expect(result.preimageBytes.at(-1)).not.toBe(0);
    expect(result.preimageBytes.toString("utf8").split("\0")[0]).toBe(domain);
  });

  it("binds exactly one byte differently with an independently fixed digest", () => {
    const bytes = Buffer.from(pure.preimageUtf8, "utf8");
    const change = vectors.oneByteMutation;
    bytes[change.offset] = change.replacementByte;
    expect([...bytes].filter((byte, index) => byte !== Buffer.from(pure.preimageUtf8)[index])).toHaveLength(1);
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(change.hashHex);
    expect(change.hashHex).not.toBe(pure.hashHex);
  });

  it.each(vectors.vectors)("excludes idempotency/correlation and generated outputs for $name", (vector) => {
    const first = { command: vector.command, result: { id: otherId, createdAt: "2026-09-08T00:00:00.000001Z" } };
    const retry = {
      command: { ...vector.command, idempotencyKey: "different-idempotency-0002", correlationId: "different-correlation-0002" },
      result: { id: "000000ff-0000-0000-0000-000000000000", createdAt: "2026-09-08T00:00:00.000002Z" },
    };
    expect(calculate(vector.scope, first.command)).toEqual(calculate(vector.scope, retry.command));
    for (const name of ["generatedInvestigationId", "generatedRootId", "generatedRevisionId", "createdAt", "result"]) {
      expect(() => calculate(vector.scope, { ...vector.command, [name]: first.result })).toThrow("unexpected material field");
    }
  });

  it("separates operations and scientific domains, exposing no raw fragment builder", () => {
    expect(new Set(vectors.vectors.map((v) => v.hashHex)).size).toBe(7);
    expect(() => investigationCreateMaterialIdentityV1(scope, { ...investigation, operation: "RESEARCH_DRAFT_REVISION_CREATE_V1" } as never)).toThrow("wrong material operation");
    expect(() => draftRevisionCreateMaterialIdentityV1(scope, vectors.vectors[5].command as never)).toThrow("wrong material operation");
    expect(() => hypothesisRevisionCreateMaterialIdentityV1(scope, vectors.vectors[3].command as never)).toThrow("wrong material operation");
    expect("identity" in research).toBe(false);
    expect("scopeFragments" in research).toBe(false);
    expect("revisionFragments" in research).toBe(false);
    expect(() => research.canonicalHashDomainV1(domain)).toThrow("unknown hash domain");
    for (const vector of vectors.vectors.slice(3)) {
      expect(vector.hashHex).not.toBe(vector.command.content!.ref.hashHex);
    }
  });
});

describe("canonical scope evidence is material data, never authority", () => {
  it.each(vectors.vectors)("binds actor, Principal and tenant for $name", (vector) => {
    for (const change of [{ actorId: "user_another_verified_subject" }, { principalId: otherId }, { tenantId: otherId }]) {
      expect(calculate({ ...vector.scope, ...change }, vector.command).materialRequestHash).not.toBe(vector.hashHex);
    }
  });

  it("binds source context/scope and account where admitted", () => {
    expect(calculate({ ...scope, sourceContext: "TEST_PORTFOLIO" }, investigation).materialRequestHash).not.toBe(pure.hashHex);
    const account = vectors.vectors[2];
    expect(calculate(account.scope, account.command).materialRequestHash).not.toBe(pure.hashHex);
    expect(calculate({ ...account.scope, accountId: otherId }, account.command).materialRequestHash).not.toBe(account.hashHex);
    for (const vector of vectors.vectors.slice(3)) {
      expect(() => calculate(account.scope, vector.command)).not.toThrow();
      expect(calculate(account.scope, vector.command).materialRequestHash).not.toBe(vector.hashHex);
    }
  });

  it("rejects unadmitted scope/context tuples and account null/absence substitutions", () => {
    for (const sourceContext of ["PURE_RESEARCH", "TEST_PORTFOLIO"]) {
      for (const accountId of [null, undefined, otherId]) {
        expect(() => calculate({ ...scope, sourceContext, accountId }, investigation)).toThrow();
      }
    }
    for (const evidence of [
      undefined, null, {}, { service_role: true },
      { ...scope, actorKind: "SYSTEM_ACTOR" },
      { ...scope, operationScope: "DOMAIN_SCOPE" },
      { ...scope, sourceContext: "USER_PORTFOLIO" },
      { ...scope, operationScope: "ACCOUNT_SCOPE", sourceContext: "USER_PORTFOLIO" },
      { ...scope, operationScope: "ACCOUNT_SCOPE", sourceContext: "USER_PORTFOLIO", accountId: null },
      { ...scope, operationScope: "ACCOUNT_SCOPE", accountId: otherId },
    ]) expect(() => calculate(evidence, investigation)).toThrow();
  });

  it("preserves opaque actor bytes without UUID assumptions or delimiter injection", () => {
    for (const actorId of ["user_provider_subject", "a\0scope=ACCOUNT_SCOPE", "é", "e\u0301", "a\nb=c", "🙂"]) {
      const result = calculate({ ...scope, actorId }, investigation);
      const fragments = result.preimageBytes.toString("utf8").split("\0");
      expect(fragments).toHaveLength(9);
      expect(fragments[3]).toBe(`actor_utf8_hex=${Buffer.from(actorId).toString("hex").toUpperCase()}`);
    }
    expect(calculate({ ...scope, actorId: "é" }, investigation).materialRequestHash)
      .not.toBe(calculate({ ...scope, actorId: "e\u0301" }, investigation).materialRequestHash);
    for (const actorId of ["", "\ud800", "a".repeat(4097), 42, null]) {
      expect(() => calculate({ ...scope, actorId }, investigation)).toThrow();
    }
    expect(() => calculate({ ...scope, actorId: "a".repeat(4096) }, investigation)).not.toThrow();
  });

  it.each(vectors.vectors)("rejects authority injection into $name commands", (vector) => {
    for (const field of ["userId", "principalId", "actorId", "tenantId", "accountId", "requestedBy", "organizationId", "service_role", "authority", "sourceDraftRevisionId"]) {
      expect(() => calculate(vector.scope, { ...vector.command, [field]: otherId })).toThrow("unexpected material field");
    }
  });
});

describe.each(["DRAFT", "HYPOTHESIS"])("%s revision material predecessor", (kind) => {
  const firstVector = vectors.vectors.find((v) => v.name === `${kind}_FIRST`)!;
  const successorVector = vectors.vectors.find((v) => v.name === `${kind}_SUCCESSOR`)!;
  const first = firstVector.command as DraftRevisionCreateMaterialRequestV1 | HypothesisRevisionCreateMaterialRequestV1;
  const successor = successorVector.command as typeof first;
  const ownPointer = kind === "DRAFT" ? "expectedResearchDraftRevisionId" : "expectedHypothesisRevisionId";

  it("binds Investigation, content proof, every admitted pointer and each head field", () => {
    const changes = [
      { investigationId: otherId },
      ...["expectedActivePointerVersion", "expectedResearchDraftRevisionId", "expectedHypothesisRevisionId"].map((key) => ({
        expectedPointers: { ...successor.expectedPointers, [key]: key === "expectedActivePointerVersion" ? "5" : otherId },
      })),
      ...["rootId", "headRevisionId", "headRevisionNumber"].map((key) => ({
        expectedRoot: { ...successor.expectedRoot, [key]: key === "headRevisionNumber" ? "3" : otherId },
      })),
    ];
    for (const change of changes) expect(calculate(scope, { ...successor, ...change }).materialRequestHash).not.toBe(successorVector.hashHex);
    const content = structuredClone(successor.content);
    if (kind === "DRAFT") {
      const proof = content as DraftRevisionCreateMaterialRequestV1["content"];
      (proof.payload as { rawIntent: string }).rawIntent += "!";
      (proof.ref as { hashHex: string }).hashHex = hashResearchDraftV1(proof.payload);
    } else {
      const proof = content as HypothesisRevisionCreateMaterialRequestV1["content"];
      (proof.payload as { statement: string }).statement += "!";
      (proof.ref as { hashHex: string }).hashHex = hashHypothesisV1(proof.payload);
    }
    expect(calculate(scope, { ...successor, content }).materialRequestHash).not.toBe(successorVector.hashHex);
    // Same content and aggregate evidence; only root/head absence changes.
    const noActive = { ...successor.expectedPointers, [ownPointer]: null };
    expect(calculate(scope, { ...successor, expectedPointers: noActive, expectedRoot: { state: "ABSENT" } }).materialRequestHash)
      .not.toBe(calculate(scope, { ...successor, expectedPointers: noActive }).materialRequestHash);
  });

  it("preserves full A3 evidence while rejecting non-null future pointers", () => {
    for (const field of Object.keys(first.expectedPointers)) {
      const omitted = { ...first.expectedPointers };
      delete omitted[field];
      expect(() => calculate(scope, { ...first, expectedPointers: omitted })).toThrow("missing material field");
      expect(() => calculate(scope, { ...first, expectedPointers: { ...first.expectedPointers, [field]: undefined } })).toThrow();
    }
    for (const field of ["expectedResearchSpecRevisionId", "expectedExperimentId"]) {
      for (const invalid of [otherId, "-", "null", "", false]) {
        expect(() => calculate(scope, { ...first, expectedPointers: { ...first.expectedPointers, [field]: invalid } })).toThrow();
      }
    }
    const bytes = calculate(scope, first).preimageBytes.toString("utf8");
    expect(bytes).toContain("\0expected_spec=-\0expected_experiment=-\0");
    expect(() => calculate(scope, first)).not.toThrow(); // Hypothesis requires no Draft.
  });

  it("rejects malformed roots, counters, UUIDs and scientific proof references", () => {
    for (const root of [null, {}, { state: "ABSENT", rootId: null }, { state: "PRESENT" }, { state: "unknown" }]) {
      expect(() => calculate(scope, { ...first, expectedRoot: root })).toThrow();
    }
    expect(() => calculate(scope, { ...first, expectedPointers: { ...first.expectedPointers, [ownPointer]: otherId } })).toThrow("absent root");
    for (const counter of [0, 1, -1, "-0", "01", "+1", "1.0", "1e3", "9223372036854775808", "", " 1", "1\0", null]) {
      expect(() => calculate(scope, { ...successor, expectedPointers: { ...successor.expectedPointers, expectedActivePointerVersion: counter } })).toThrow();
      expect(() => calculate(scope, { ...successor, expectedRoot: { ...successor.expectedRoot, headRevisionNumber: counter } })).toThrow();
    }
    expect(() => calculate(scope, { ...successor, expectedRoot: { ...successor.expectedRoot, headRevisionNumber: "0" } })).toThrow();
    for (const counter of ["9007199254740993", "9223372036854775807"]) {
      expect(() => calculate(scope, { ...successor, expectedPointers: { ...successor.expectedPointers, expectedActivePointerVersion: counter }, expectedRoot: { ...successor.expectedRoot, headRevisionNumber: counter } })).not.toThrow();
    }
    for (const id of [otherId.toUpperCase(), "-", "null", "", ` ${otherId}`, `${otherId}\0`, null]) {
      expect(() => calculate(scope, { ...successor, investigationId: id })).toThrow();
      expect(() => calculate(scope, { ...successor, expectedRoot: { ...successor.expectedRoot, rootId: id } })).toThrow();
    }
    for (const hashHex of ["A".repeat(63), "a".repeat(64), "G".repeat(64), "0".repeat(64), `${successor.content.ref.hashHex}\0`, null]) {
      expect(() => calculate(scope, { ...successor, content: { ...successor.content, ref: { ...successor.content.ref, hashHex } } })).toThrow();
    }
    for (const change of [{ hashAlgorithm: "SHA-512" }, { hashVersion: "V2" }, { hashDomain: "SYNTRAKE:RESEARCH_IR:V1" }]) {
      expect(() => calculate(scope, { ...successor, content: { ...successor.content, ref: { ...successor.content.ref, ...change } } })).toThrow();
    }
  });
});

describe("closed admission and code boundary", () => {
  it("rejects malformed identity UUIDs, transport metadata and absent inputs", () => {
    for (const field of ["principalId", "tenantId"]) {
      for (const invalid of [otherId.toUpperCase(), "user_123", null, undefined]) expect(() => calculate({ ...scope, [field]: invalid }, investigation)).toThrow();
    }
    for (const field of ["idempotencyKey", "correlationId"]) {
      for (const invalid of [null, undefined, "short", "a".repeat(513), "\udfff".repeat(16)]) expect(() => calculate(scope, { ...investigation, [field]: invalid })).toThrow();
    }
    for (const invalid of [null, undefined, [], new Date(), Object.create(scope)]) expect(() => calculate(invalid, investigation)).toThrow();
  });

  it("does not execute getters or accept symbols/non-enumerable fields", () => {
    let calls = 0;
    const accessor = { ...scope, get actorId() { calls++; return "user_injected"; } };
    expect(() => calculate(accessor, investigation)).toThrow();
    expect(calls).toBe(0);
    expect(() => calculate({ ...scope, [Symbol("hidden")]: true }, investigation)).toThrow();
    const hidden = Object.defineProperty({ ...scope }, "actorId", { value: scope.actorId, enumerable: false });
    expect(() => calculate(hidden, investigation)).toThrow();
    const reordered = Object.fromEntries(Object.entries(scope).reverse());
    expect(calculate(reordered, investigation)).toEqual(calculate(scope, investigation));
  });

  it("contains only identity dependencies and no persistence/authority side effects", () => {
    const source = readFileSync("lib/investing/research/materialRequest.ts", "utf8");
    expect([...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1])).toEqual(["./canonical", "./semantic"]);
    expect(source).not.toMatch(/\b(fetch|query|connect|randomUUID)\s*\(/);
    expect(source).not.toContain("sourceDraftRevisionId");
  });
});
