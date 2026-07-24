# Investing Phase 5B authenticated scope

Phase 5B adds an internal server-only identity boundary in front of the
accepted Phase 5A application boundary. It has no API, route, UI, Server
Action, cron, queue, worker, broker, provider, Paper or Live caller.

## Trust boundary

Future callers may provide only operation material such as a sealed source
reference, idempotency key or run identifier. Owner, tenant, portfolio and
account identifiers are not accepted in these request shapes.

The server dependencies resolve:

1. the authenticated user and request identifier;
2. exactly one active membership authorized for the requested operation;
3. exactly one active, Investing-enabled portfolio matching that membership;
4. the owner, tenant, portfolio and account scope passed to Phase 5A.

Missing, revoked, inactive, inconsistent or ambiguous records fail closed
before Phase 5A is called. Every such failure uses the same
`identity_scope_not_authorized` response and does not disclose whether a
cross-tenant resource exists.

## Modules

- `lib/investing/identity/index.ts` is the neutral contracts/errors entrypoint.
- `lib/investing/identity/server.ts` is the official server-only entrypoint.
- `resolver.server.ts` resolves session, membership, permission and portfolio.
- `gateway.server.ts` constructs the Phase 5A context and target internally.
- `factory.server.ts` requires all official dependencies explicitly.

The implementation contains no SQL, environment access, connection creation,
canonicalization, writer, reader, verifier or replay implementation. All
commands and queries delegate to the accepted Phase 5A boundary.

## Deliberate scope

Phase 5B defines ports for the official authenticated session and scope
directory. Product adapters and callers remain deferred. Phase 5C through 5F
are not started.
