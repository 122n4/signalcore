# RL-9C2B2B — Separate Linux Principal Isolation Rehearsal V1

Status: CANDIDATE / SYNTHETIC_OS_UID_REHEARSAL_ONLY / NOT ACCEPTED / NO REAL HOLDOUT ADMISSION.

Predecessor: `cbf98257427c4c523f5f3333495f4ce6b6e936c4` (accepted RL-9C2B2A source).

## Purpose

Before provisioning an independent Secret Vault, exercise one actual Linux
kernel enforcement boundary rather than treating synthetic `service_role` strings
or TypeScript module boundaries as identity separation.

One disposable privileged GitHub-hosted runner prepares a private synthetic
file (0600) and directory (0700) owned by a dedicated unprivileged UID. It
spawns a fresh Node process as that UID and demands positive access, then as a
different ordinary application UID holding an explicitly **synthetic**
`SUPABASE_SERVICE_ROLE_KEY` string and demands kernel denial (EACCES/EPERM).
Any unexpected result fails the job. The entire test directory is destroyed.
The job has no repository write permissions, no app/Vault secrets, no
`pull_request_target`, and rejects forked PR execution under `sudo`.

## Exact limitations

- This is **not a deployed dedicated Vault worker**, actual Supabase or object
  store storage isolation, nor a test involving any real project `service_role`.
- Linux root can read the file regardless of directory ownership. The future
  deploy must prove the ordinary runtime is non-root, lacks `CAP_DAC_OVERRIDE`,
  lacks privilege escalation, and cannot enter the Vault principal's namespace.
- Separate UIDs in a disposable CI host do not prove dedicated runtime host,
  private network, mTLS deployment, credential/KMS separation, key custody,
  multi-host nonce uniqueness, anti-reuse, embargo or one-shot reveal.
- Do not infer that a green UID test proves data secrecy against ordinary
  provider data paths or an operator with host root access.
- No private object locators, encryption material or real holdout values may
  appear in the ordinary Next/Vercel/AI/Research runtime or CI outputs.
- The isolated Vault storage provider/project, cost, account and operator
  ownership remain **UNSELECTED / UNPROVISIONED**. Existing inactive projects
  cannot be silently repurposed. Any new paid infrastructure or Production
  mutation requires separate owner authorization and applicable cost approval.
- Before introducing secret material, prove with **actual** separate credential
  contexts that the ordinary application and its primary Supabase `service_role`
  receive access denial to the same private synthetic object which the
  authorized independent worker can read. A 404 on an absent object is not a
  denial proof; test the same extant object with positive and negative controls.
- Production admission remains **BLOCKED** until RL-9C3 embargo/prior-access
  completeness, RL-9C4 global reuse/nonce/consume-once fences, and RL-9D
  one-shot reveal are proven. RL-9C remains IN_PROGRESS.

Highest admissible gate:
`RL-9C2B2B_LINUX_UID_REHEARSAL_PASS / REAL_VAULT_ISOLATION_UNPROVEN`.

This slice changes only a synthetic proof script, a minimum-permission CI
workflow and this audit contract. It must not change existing Investing/Trading
Core, migration, Supabase state, Vercel deployment configuration, broker state,
public metadata or any real financial state.
