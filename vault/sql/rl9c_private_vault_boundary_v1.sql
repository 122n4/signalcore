-- SYNTRAKE RL-9C — VAULT PROJECT ONLY, isolated PostgreSQL 17 rehearsal candidate.
-- Never include this file in supabase/migrations: those target PRIMARY.
-- Apply to VAULT only after exact-SHA rehearsal + explicit operator approval.
-- Intentional fail-closed defaults: no identity rows, no secret objects,
-- and an independent encryption key (NEVER in Supabase or Vercel).
begin;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise exception 'RL9C_VAULT_STORAGE_SCHEMA_REQUIRED';
  end if;
  if to_regprocedure('storage.allow_only_operation(text)') is null then
    raise exception 'RL9C_STORAGE_OPERATION_GUARD_REQUIRED';
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception 'RL9C_VAULT_AUTH_UID_REQUIRED';
  end if;
end $$;

create schema if not exists syntrake_vault_private;
revoke all on schema syntrake_vault_private from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='syntrake_vault_writer') then
    create role syntrake_vault_writer nologin noinherit;
  end if;
end $$;

-- JWT owner enrollment: only trusted VAULT DB administrators can enroll.
-- SELECT is necessary for the Storage RLS subquery. The authenticated
-- principal can see only their own enrollment, never add or edit it.
create table syntrake_vault_private.worker_auth_enrollments_v1 (
  auth_user_id uuid primary key,
  enabled boolean not null default false,
  enrolled_at timestamptz not null default transaction_timestamp()
);
alter table syntrake_vault_private.worker_auth_enrollments_v1 enable row level security;
alter table syntrake_vault_private.worker_auth_enrollments_v1 force row level security;
revoke all on syntrake_vault_private.worker_auth_enrollments_v1 from public, anon, authenticated, service_role;
grant usage on schema syntrake_vault_private to authenticated;
grant select on syntrake_vault_private.worker_auth_enrollments_v1 to authenticated;
create policy rl9c_vault_worker_self_check_v1
  on syntrake_vault_private.worker_auth_enrollments_v1
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- Fingerprint is 32-byte HMAC-SHA256 of canonical SECRET plaintext under
-- an independent, Vault-host-only NON-ROTATED V1 pepper. Never upload salt,
-- pepper, plaintext, SHA-256(raw secret) or secret scope to this table.
-- Unique across tenants deliberately prevents the same concealed truth
-- from being resealed elsewhere within the Vault project.
create table syntrake_vault_private.confidential_fingerprints_v1 (
  fingerprint_id uuid primary key default gen_random_uuid(),
  fingerprint_hmac bytea not null unique
    check (octet_length(fingerprint_hmac)=32),
  hmac_key_version text not null
    check (hmac_key_version='VAULT_HMAC_V1'),
  sealed_at timestamptz not null default transaction_timestamp()
);
alter table syntrake_vault_private.confidential_fingerprints_v1 enable row level security;
alter table syntrake_vault_private.confidential_fingerprints_v1 force row level security;

create table syntrake_vault_private.sealed_ciphertexts_v1 (
  sealed_id uuid primary key default gen_random_uuid(),
  fingerprint_id uuid not null unique
    references syntrake_vault_private.confidential_fingerprints_v1(fingerprint_id),
  tenant_id uuid not null,
  registration_hash_hex text not null
    check (registration_hash_hex ~ '^[A-F0-9]{64}$'),
  sealed_locator_hex text not null unique
    check (sealed_locator_hex ~ '^[A-F0-9]{64}$'),
  ciphertext_sha256_hex text not null
    check (ciphertext_sha256_hex ~ '^[A-F0-9]{64}$'),
  sealed_at timestamptz not null default transaction_timestamp()
);
alter table syntrake_vault_private.sealed_ciphertexts_v1 enable row level security;
alter table syntrake_vault_private.sealed_ciphertexts_v1 force row level security;

-- Burn must be transaction-COMMITTED in the VAULT before any Storage read.
-- No UPDATE/DELETE privilege; failures and crashes consume the attempt.
-- The isolated worker MUST independently verify a signed, committed PRIMARY
-- claim before inserting here; this table itself is not an ALLOW decision.
create table syntrake_vault_private.reveal_burns_v1 (
  burn_id uuid primary key default gen_random_uuid(),
  sealed_id uuid not null unique
    references syntrake_vault_private.sealed_ciphertexts_v1(sealed_id),
  tenant_id uuid not null,
  evaluation_hash_hex text not null unique
    check (evaluation_hash_hex ~ '^[A-F0-9]{64}$'),
  reveal_started_hash_hex text not null
    check (reveal_started_hash_hex ~ '^[A-F0-9]{64}$'),
  burned_at timestamptz not null default transaction_timestamp()
);
alter table syntrake_vault_private.reveal_burns_v1 enable row level security;
alter table syntrake_vault_private.reveal_burns_v1 force row level security;

revoke all on syntrake_vault_private.confidential_fingerprints_v1,
  syntrake_vault_private.sealed_ciphertexts_v1,
  syntrake_vault_private.reveal_burns_v1
  from public, anon, authenticated, service_role;
grant usage on schema syntrake_vault_private to syntrake_vault_writer;
grant select, insert on syntrake_vault_private.confidential_fingerprints_v1,
  syntrake_vault_private.sealed_ciphertexts_v1,
  syntrake_vault_private.reveal_burns_v1 to syntrake_vault_writer;
create policy rl9c_vault_writer_fingerprints_select_v1
  on syntrake_vault_private.confidential_fingerprints_v1
  for select to syntrake_vault_writer
  using (true);
create policy rl9c_vault_writer_fingerprints_insert_v1
  on syntrake_vault_private.confidential_fingerprints_v1
  for insert to syntrake_vault_writer
  with check (true);
create policy rl9c_vault_writer_sealed_select_v1
  on syntrake_vault_private.sealed_ciphertexts_v1
  for select to syntrake_vault_writer
  using (true);
create policy rl9c_vault_writer_sealed_insert_v1
  on syntrake_vault_private.sealed_ciphertexts_v1
  for insert to syntrake_vault_writer
  with check (true);
create policy rl9c_vault_writer_burn_select_v1
  on syntrake_vault_private.reveal_burns_v1
  for select to syntrake_vault_writer
  using (true);
create policy rl9c_vault_writer_burn_insert_v1
  on syntrake_vault_private.reveal_burns_v1
  for insert to syntrake_vault_writer
  with check (true);

-- Storage may serve ONLY private authenticated-object GET, never LIST or
-- signed-URL generation. No worker enrollment exists at migration time.
-- Storage API project-host signature verification precedes the RLS policy.
-- A Vault-issued JWT role=authenticated is necessary but insufficient:
-- the subject MUST have an enabled administrator-provisioned enrollment.
create policy rl9c_vault_reveal_worker_read_v1 on storage.objects
  for select to authenticated
  using (
    bucket_id = 'syntrake-private-sealed'
    and name ~ '^sealed-v1/[A-F0-9]{64}\.json
    and storage.allow_only_operation('object.get_authenticated')
    and exists (
      select 1
      from syntrake_vault_private.worker_auth_enrollments_v1 e
      where e.auth_user_id=(select auth.uid()) and e.enabled
    )
  );

-- No upsert, overwrite, move, delete, list, or signed-URL policies.
-- Ciphertext upload is intentionally NOT admitted in this first migration:
-- the dedicated writer identity + no-overwrite upload gate must be proved
-- in separate Vault-only rehearsal before operational seal.
commit;

    and storage.allow_only_operation('object.get_authenticated')
    and exists (
      select 1
      from syntrake_vault_private.worker_auth_enrollments_v1 e
      where e.auth_user_id=(select auth.uid()) and e.enabled
    )
  );

-- No upsert, overwrite, move, delete, list, or signed-URL policies.
-- Ciphertext upload is intentionally NOT admitted in this first migration:
-- the dedicated writer identity + no-overwrite upload gate must be proved
-- in separate Vault-only rehearsal before operational seal.
commit;
