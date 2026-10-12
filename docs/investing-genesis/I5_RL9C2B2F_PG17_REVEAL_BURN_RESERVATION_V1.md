# RL-9C2B2F — Committed REVEAL_STARTED → durable PG burn → synthetic ciphertext

**State:** `DRAFT / INTEGRATED_DISPOSABLE_PG17_REHEARSAL / NO_REAL_VAULT_AUTHORIZATION`

Unaccepted immediate parent: PR #150 SHA `ae12bc1d50632ddb3fd4cb54419793f5856a6b3f`. Accepted main remains unchanged. Candidate migration: `20261012213000_investing_i5_rl9c2b2f_pg17_consume_burn_reservation.sql`; not applied to Production.

## Actual executable security improvement

The RL-9B2 writer already persists an immutable, hash-checked `REVEAL_STARTED` event. PR #149 proved one-shot POSIX filesystem handling for synthetic sealed ciphertext; PR #150 connected the two only within a privileged test harness. **This candidate now adds an independent PostgreSQL one-shot evidence layer**, not just another file flag:

- A real PG17 table `investing.research_blind_truth_consume_reservations_v1`, with FORCE RLS, append-only UPDATE/DELETE rejection, foreign keys to existing authoritative evaluation and event identities, UNIQUE tenant/evaluation and tenant/started-event keys and a single `BURNED_NOT_AUTHORIZED` state.
- An `investing_rl9_writer`-owned `SECURITY DEFINER` function `rl9c2b2f_reserve_committed_reveal_burn_v1(text,text)` under fixed `search_path`, taking the *canonical evaluation and started event hashes*, not a client Boolean. It verifies exact tenant/principal/membership/investigation and existing `REVEAL_STARTED` PG17 row with correct evaluation, refuses already-final events, serializes concurrent attempts with a transaction advisory lock, inserts precisely one reservation, then returns **`BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED`**. No positive read outcome is representable.
- This function is **not executable by `investing_app`, `service_role`, `anon` or `authenticated`**. The NOLOGIN internal writer can use it only through a privileged execution path, exercised here by `SET ROLE` under disposable PostgreSQL superuser. There is **no deployed Vault capability**.
- Explicit distinction between uncommitted and committed burns: a successful SQL response **may still be rolled back**. The synthetic ciphertext test verifies a committed event **and** a separately committed burn before opening any private synthetic ciphertext. The filesystem one-shot marker then independently blocks replays.
- New PG17 tests cover missing/wrong event/evaluation, rollbacks, same-evaluation cross-connection races (one wins), attempts after terminal scientific events, FORCE RLS cross-tenant visibility, immutable records, and the two-ledger PG commit → AES-256-GCM synthetic envelope → commitment verification flow. No real credentials, market data or confidential holdouts enter this test.

## Mandatory non-claims

This implements **durable PostgreSQL reservation evidence** against concurrent/replayed attempts, *not* a real authorization to consume confidential holdout data. The consumer in the isolated synthetic worker still trusts caller-supplied SHA-shaped identifiers, while this function is available only to the test/admin path. There is no independently credentialed Vault principal, transactionally shared PG/FileSystem atomicity, crash-proof cross-host or backup-restore index, source/provider/cache embargo-through-byte delivery, complete historic no-exposure audit, or verified evaluator. Therefore **none of this authorizes any real byte release or real `REVEAL_COMPLETED`**. The SQL function intentionally returns NOT_AUTHORIZED even when it records the burn.

The reserve function checks a visible authenticated scientific event under internal role/RLS scoped GUCs. **GUC values are not user authorization.** Production-grade Vault execution would require the server to derive ownership and credentials independently and enforce a fresh authority transaction; untrusted app/service clients cannot be granted this function.

Tests are on disposable PostgreSQL 17; no new tables, grants or migrations are applied to Production, no merge or deployment, and no extra paid infrastructure. This slice does not mark RL-9 accepted.

## Next operational gate

Give a genuinely isolated Vault worker its own constrained identity and verify a one-shot *committed* PG event and burned reservation through a verified server-to-worker protocol with transactional failure recovery; protect every ordinary provider/cache byte path and prove complete pre-registration non-exposure. Implement the deterministic canonical evaluator with immutable result lineage. Keep Investing/Trading Core independent of optional Research Lab.
