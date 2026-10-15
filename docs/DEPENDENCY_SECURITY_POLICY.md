# Dependency Security Policy V2

Status: `CANDIDATE / NOT YET CANONICAL`

This policy separates production dependency risk from dev-only tooling risk. It is risk classification, not vulnerability suppression.

Production graph security remains a hard-zero rule. `npm audit --omit=dev` must report zero vulnerabilities at every severity. Any production vulnerability fails the gate.

The full dependency graph remains visible. Raw `npm audit` findings must be reported, and the gate must explain every residual finding. The policy does not use npm audit suppression, advisory ignores, package forks, package aliases, or severity-threshold hiding.

Fixable dev vulnerabilities are blockers unless the proposed remediation is classified as non-actionable. A remediation is not safe merely because npm returns a `fixAvailable` object. A safe actionable remediation must be forward-moving, preserve the framework/toolchain version line, avoid unauthorized major migrations, avoid runtime behavior changes, preserve security, resolve the root cause, keep the dependency tree coherent, and pass deterministic installation plus all gates.

Critical dev vulnerabilities are blockers even when unpatched.

Non-critical dev-only findings may pass only when they are registered as exact residual exceptions with advisory identity, vulnerable package, expected severity, expected range, expected installed version, expected dependency nodes, dev-only reachability, reason, and remediation status. Exception drift fails closed.

Examples of drift that fail closed include a new advisory, severity increase, production reachability, a new dependency path, unexpected installed version, a changed remediation target, a safe remediation becoming available, or a mismatch between the exception and the real audit output.

When an upstream remediation becomes safe and actionable, the finding returns to blocker status until the remediation is applied and validated. No package/advisory allowlist is used to hide raw findings; exceptions are auditable records of a specific dev-only residual state.
