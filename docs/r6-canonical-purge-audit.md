# R6 Canonical Purge Audit

Status: IN PROGRESS

Purpose: eliminate or quarantine reachable legacy/non-canonical Investing truth paths before any further R6 activation.

Hard rules:
- no production deploy or DB mutation;
- no new feature work;
- no Trading coupling;
- no canonical-to-legacy fallback;
- missing financial truth remains UNAVAILABLE, never coerced to zero/100%/recommendation;
- service_role is capability, never authorization;
- every removal requires reachability proof and regression coverage.

Initial confirmed blocker: existing GET /api/investing/plan still reads legacy public.plans through the old server reader while the accepted A3D/A3E Plan architecture uses immutable revisions + head + idempotency.

Findings and remediation will be appended only after independent verification against the integrated canonical commit.
