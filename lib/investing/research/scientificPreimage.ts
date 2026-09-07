import {
  assertHashDomainAdmittedForHashingV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  type CanonicalJsonValue,
  type HashDomainV1,
} from "./canonical";

export function ownerStructuredHashPreimageV1(domain: HashDomainV1, payload: CanonicalJsonValue): Buffer {
  assertHashDomainAdmittedForHashingV1(domain);
  return Buffer.concat([Buffer.from(`${domain}\n`, "utf8"), i5ResearchInternalCanonicalJsonBytesV1(payload)]);
}
