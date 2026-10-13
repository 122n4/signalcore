-- RL-9C VAULT ONLY — follow-up for deployed 20261013201802_rl9c_private_vault_boundary_v1.
-- Storage GET must never be admitted solely because a worker is enrolled.
-- Requires a committed, matching ciphertext+tenant burn, bound to auth.uid().
-- Every permit expires within 60 seconds; no UPDATE/DELETE is granted.
-- A SELECT policy IS NOT an atomic one-time GET counter. The isolated worker
-- must independently gate physical reads and issue a durable one-use intent.
-- PostgreSQL Storage RLS protects object-level scope, not exactly-once I/O.
-- APPLY ONLY to Vault project, after exact-SHA PG17 rehearsal and operator authorization.
begin;

do $$
begin
  if to_regclass('syntrake_vault_private.reveal_burns_v1') is null
     or to_regclass('syntrake_vault_private.sealed_ciphertexts_v1') is null
     or to_regclass('syntrake_vault_private.worker_auth_enrollments_v1') is null
     or not exists (
       select 1 from pg_policies where schemaname='storage'
       and tablename='objects' and policyname='rl9c_vault_reveal_worker_read_v1'
     ) then
    raise exception 'RL9C_VAULT_PREDECESSOR_MISSING';
  end if;
  -- No currently live workers/burns can be silently invalidated by DDL.
  if exists (select 1 from syntrake_vault_private.worker_auth_enrollments_v1
             where enabled)
     or exists (select 1 from syntrake_vault_private.reveal_burns_v1)
     or exists (select 1 from syntrake_vault_private.sealed_ciphertexts_v1) then
    raise exception 'RL9C_VAULT_ACTIVE_STATE_REQUIRES_SEPARATE_REHEARSAL';
  end if;
end $$;

-- A burn is bound to ONE enrolled reader identity, as well as a sealed object.
-- A short GET lease limits replay exposure. An expired burn is irrecoverable.
alter table syntrake_vault_private.reveal_burns_v1
  add column reader_auth_user_id uuid not null
    references syntrake_vault_private.worker_auth_enrollments_v1(auth_user_id),
  add column access_expires_at timestamptz not null,
  add constraint rl9c_read_window_bounded_v1
    check (access_expires_at > burned_at
       and access_expires_at <= burned_at + interval '60 seconds');

alter table syntrake_vault_private.sealed_ciphertexts_v1
  add constraint rl9c_sealed_tenant_unique_v1 unique (sealed_id,tenant_id);
alter table syntrake_vault_private.reveal_burns_v1
  add constraint rl9c_burn_same_tenant_v1
  foreign key (sealed_id,tenant_id)
  references syntrake_vault_private.sealed_ciphertexts_v1(sealed_id,tenant_id);

-- Minimal metadata access is required for RLS subquery evaluation. No
-- ciphertext, private HMAC or underlying envelope bytes are in these tables.
-- Neither role can INSERT/UPDATE/DELETE the private tables.
grant select (sealed_id,tenant_id,reader_auth_user_id,access_expires_at)
  on syntrake_vault_private.reveal_burns_v1 to authenticated;
grant select (sealed_id,tenant_id,sealed_locator_hex)
  on syntrake_vault_private.sealed_ciphertexts_v1 to authenticated;

-- PostgreSQL evaluates these two SELECT policies inside the Storage policy.
-- Deliberately no SECURITY DEFINER or service_role shortcuts.
create policy rl9c_reader_scoped_committed_burn_v1
  on syntrake_vault_private.reveal_burns_v1
  for select to authenticated
  using (
    reader_auth_user_id = (select auth.uid())
    and access_expires_at > statement_timestamp()
    and exists (
      select 1 from syntrake_vault_private.worker_auth_enrollments_v1 e
      where e.auth_user_id = (select auth.uid()) and e.enabled
    )
  );

create policy rl9c_reader_scoped_sealed_v1
  on syntrake_vault_private.sealed_ciphertexts_v1
  for select to authenticated
  using (
    exists (
      select 1 from syntrake_vault_private.reveal_burns_v1 b
      where b.sealed_id=sealed_id and b.tenant_id=tenant_id
        and b.reader_auth_user_id=(select auth.uid())
        and b.access_expires_at>statement_timestamp()
    )
  );

drop policy rl9c_vault_reveal_worker_read_v1 on storage.objects;
create policy rl9c_vault_reveal_worker_read_v2 on storage.objects
  for select to authenticated
  using (
    bucket_id='syntrake-private-sealed'
    and name ~ '^sealed-v1/[A-F0-9]{64}\.json
    and storage.allow_only_operation('object.get_authenticated')
    and exists (
      select 1 from syntrake_vault_private.sealed_ciphertexts_v1 s
      join syntrake_vault_private.reveal_burns_v1 b
        on b.sealed_id=s.sealed_id and b.tenant_id=s.tenant_id
      where name='sealed-v1/' || s.sealed_locator_hex || '.json'
        and b.reader_auth_user_id=(select auth.uid())
        and b.access_expires_at>statement_timestamp()
        and exists (
          select 1 from syntrake_vault_private.worker_auth_enrollments_v1 e
          where e.auth_user_id=(select auth.uid()) and e.enabled
        )
    )
  );

-- No storage INSERT/UPDATE/DELETE policy added.
-- No Auth user is enrolled or created by this migration.
commit;

    and storage.allow_only_operation('object.get_authenticated')
    and exists (
      select 1 from syntrake_vault_private.sealed_ciphertexts_v1 s
      join syntrake_vault_private.reveal_burns_v1 b
        on b.sealed_id=s.sealed_id and b.tenant_id=s.tenant_id
      where name='sealed-v1/' || s.sealed_locator_hex || '.json'
        and b.reader_auth_user_id=(select auth.uid())
        and b.access_expires_at>statement_timestamp()
        and exists (
          select 1 from syntrake_vault_private.worker_auth_enrollments_v1 e
          where e.auth_user_id=(select auth.uid()) and e.enabled
        )
    )
  );

-- No storage INSERT/UPDATE/DELETE policy added.
-- No Auth user is enrolled or created by this migration.
commit;
