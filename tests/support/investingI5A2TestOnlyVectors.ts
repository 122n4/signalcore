import {
  canonicalIntegerV1,
  canonicalTextV1,
  immutableBehaviorTokenV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  i5ResearchInternalStructuredHashPreimageV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type EvidenceContentDescriptorV1,
  type RunInputHashPayloadV1,
} from "../../lib/investing/research/canonical";
import { canonicalRunInputBytesV1 } from "../../lib/investing/research";

export function i5A2TestOnlyCanonicalTextVectorJsonV1(text: string): string {
  return i5ResearchInternalCanonicalJsonBytesV1({
    schemaVersion: "CANONICAL_TEXT_VECTOR_V1",
    text: canonicalTextV1(text),
  }).toString("utf8");
}

export function i5A2TestOnlyCanonicalTextVectorHashV1(text: string) {
  return sha256HexV1(
    i5ResearchInternalStructuredHashPreimageV1("SYNTRAKE:CANONICAL_TEST:V1", {
      schemaVersion: "CANONICAL_TEXT_VECTOR_V1",
      text: canonicalTextV1(text),
    }),
  );
}

export function i5A2TestOnlyCanonicalJsonEscapingVectorV1(): string {
  return i5ResearchInternalCanonicalJsonBytesV1({
    "\ud83d\ude00": "emoji-key",
    a: "\b\t\n\f\r\u0000\u001f/\u2028\u2029\u00e9",
    aa: true,
    b: null,
  }).toString("utf8");
}

export function i5A2TestOnlyRunInputPreimageV1(input: RunInputHashPayloadV1): Buffer {
  return Buffer.concat([Buffer.from("SYNTRAKE:RUN_INPUT:V1\n", "utf8"), canonicalRunInputBytesV1(input)]);
}

export function i5A2TestOnlyEvidenceObjectPreimageV1(
  descriptor: EvidenceContentDescriptorV1,
  contentBytes: Uint8Array,
): Buffer {
  const descriptorPayload = canonicalEvidenceDescriptorPayloadV1(descriptor, contentBytes.byteLength);
  return Buffer.concat([
    Buffer.from("SYNTRAKE:EVIDENCE_OBJECT:V1\n", "utf8"),
    i5ResearchInternalCanonicalJsonBytesV1(descriptorPayload),
    Buffer.from("\n", "utf8"),
    Buffer.from(contentBytes),
  ]);
}

export function i5A2TestOnlyEvidenceObjectHashV1(descriptor: EvidenceContentDescriptorV1, contentBytes: Uint8Array) {
  return sha256HexV1(i5A2TestOnlyEvidenceObjectPreimageV1(descriptor, contentBytes));
}

function canonicalEvidenceDescriptorPayloadV1(
  descriptor: EvidenceContentDescriptorV1,
  actualContentByteLength: number,
): CanonicalJsonValue {
  assertClosedPlainObject(descriptor, new Set(["schemaVersion", "kind", "artifactSchemaVersion", "format", "contentByteLength"]));
  if (descriptor.schemaVersion !== "EVIDENCE_CONTENT_DESCRIPTOR_V1") throw new Error("invalid Evidence descriptor schemaVersion");
  const contentByteLength = canonicalIntegerV1(descriptor.contentByteLength, { min: "0", allowNegative: false });
  if (contentByteLength !== String(actualContentByteLength)) throw new Error("Evidence contentByteLength mismatch");
  return {
    schemaVersion: descriptor.schemaVersion,
    kind: descriptor.kind,
    artifactSchemaVersion: immutableBehaviorTokenV1(descriptor.artifactSchemaVersion),
    format: canonicalTextV1(descriptor.format, { minBytes: 1 }),
    contentByteLength,
  };
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected closed plain object");
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    if ((value as Record<string, unknown>)[key] === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
}
