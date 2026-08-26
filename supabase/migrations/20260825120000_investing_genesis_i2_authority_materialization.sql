begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I2-A prestate violation: migration executor must be postgres';
  end if;

  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I2-A prestate violation: investing schema already exists';
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner') then
    raise exception 'I2-A prestate violation: investing_owner role already exists';
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I2-A prestate violation: investing_app role already exists';
  end if;
end $$;

create role investing_owner
  nologin
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

create role investing_app
  login
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant create on database postgres to investing_owner;
grant investing_owner to postgres with inherit false, set true;

revoke all privileges on database postgres from investing_app;

set local role investing_owner;

create schema investing;

revoke all on schema investing from public;
revoke all on schema investing from anon;
revoke all on schema investing from authenticated;
revoke all on schema investing from service_role;
revoke all on schema investing from investing_app;
grant usage on schema investing to investing_app;

alter default privileges
  revoke execute on functions from public;
alter default privileges in schema investing
  revoke all on tables from public, anon, authenticated, service_role, investing_app;
alter default privileges in schema investing
  revoke all on sequences from public, anon, authenticated, service_role, investing_app;
alter default privileges in schema investing
  revoke all on functions from public, anon, authenticated, service_role, investing_app;

create table investing.principals (
  principal_id uuid primary key default gen_random_uuid(),
  external_provider text not null,
  external_subject text not null,
  state text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint principals_external_provider_check
    check (external_provider in ('CLERK')),
  constraint principals_external_subject_check
    check (char_length(external_subject) between 1 and 256),
  constraint principals_state_check
    check (state in ('ACTIVE', 'DISABLED')),
  constraint principals_disabled_at_check
    check ((state = 'DISABLED') = (disabled_at is not null)),
  constraint principals_external_identity_key
    unique (external_provider, external_subject)
);

create table investing.tenants (
  tenant_id uuid primary key default gen_random_uuid(),
  state text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  suspended_at timestamptz,
  closed_at timestamptz,
  constraint tenants_state_check
    check (state in ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  constraint tenants_terminal_state_check
    check (
      (state = 'ACTIVE' and suspended_at is null and closed_at is null)
      or (state = 'SUSPENDED' and suspended_at is not null and closed_at is null)
      or (state = 'CLOSED' and closed_at is not null)
    )
);

create table investing.tenant_memberships (
  tenant_membership_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references investing.tenants (tenant_id),
  principal_id uuid not null references investing.principals (principal_id),
  role text not null default 'OWNER',
  state text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint tenant_memberships_role_check
    check (role in ('OWNER')),
  constraint tenant_memberships_state_check
    check (state in ('ACTIVE', 'REVOKED')),
  constraint tenant_memberships_revoked_at_check
    check ((state = 'REVOKED') = (revoked_at is not null)),
  constraint tenant_memberships_identity_tuple_key
    unique (tenant_membership_id, tenant_id, principal_id)
);

create unique index tenant_memberships_one_active_per_principal_tenant_idx
  on investing.tenant_memberships (tenant_id, principal_id)
  where state = 'ACTIVE';

create table investing.accounts (
  account_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references investing.tenants (tenant_id),
  initial_tenant_membership_id uuid not null,
  initial_principal_id uuid not null,
  account_kind text not null default 'PERSONAL',
  account_origin text not null default 'INITIAL_PERSONAL_BOOTSTRAP',
  base_currency text not null,
  state text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  frozen_at timestamptz,
  closed_at timestamptz,
  constraint accounts_initial_membership_tuple_fk
    foreign key (initial_tenant_membership_id, tenant_id, initial_principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint accounts_tenant_tuple_key
    unique (account_id, tenant_id),
  constraint accounts_kind_check
    check (account_kind in ('PERSONAL')),
  constraint accounts_origin_check
    check (account_origin in ('INITIAL_PERSONAL_BOOTSTRAP')),
  constraint accounts_base_currency_check
    check (base_currency ~ '^[A-Z]{3}$'),
  constraint accounts_state_check
    check (state in ('ACTIVE', 'FROZEN', 'CLOSED')),
  constraint accounts_terminal_state_check
    check (
      (state = 'ACTIVE' and frozen_at is null and closed_at is null)
      or (state = 'FROZEN' and frozen_at is not null and closed_at is null)
      or (state = 'CLOSED' and closed_at is not null)
    )
);

create unique index accounts_one_initial_personal_bootstrap_per_principal_idx
  on investing.accounts (initial_principal_id)
  where account_origin = 'INITIAL_PERSONAL_BOOTSTRAP';

create table investing.account_access (
  account_access_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  tenant_id uuid not null,
  tenant_membership_id uuid not null,
  principal_id uuid not null,
  role text not null default 'OWNER',
  state text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint account_access_account_tenant_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint account_access_membership_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint account_access_role_check
    check (role in ('OWNER')),
  constraint account_access_state_check
    check (state in ('ACTIVE', 'REVOKED')),
  constraint account_access_revoked_at_check
    check ((state = 'REVOKED') = (revoked_at is not null))
);

create unique index account_access_one_active_per_principal_account_idx
  on investing.account_access (account_id, principal_id)
  where state = 'ACTIVE';

create table investing.idempotency_records (
  idempotency_record_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  material_request_hash text not null,
  correlation_id text not null,
  actor_kind text not null,
  actor_id text not null,
  operation_scope text not null,
  operation text not null,
  principal_id uuid references investing.principals (principal_id),
  tenant_id uuid references investing.tenants (tenant_id),
  account_id uuid,
  status text not null default 'STARTED',
  canonical_result_reference jsonb,
  error_code text,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint idempotency_records_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint idempotency_records_operation_scope_check
    check (operation_scope in ('ACCOUNT_SCOPE', 'TENANT_SCOPE', 'DOMAIN_SCOPE')),
  constraint idempotency_records_scope_identity_check
    check (
      (operation_scope = 'ACCOUNT_SCOPE' and tenant_id is not null and account_id is not null)
      or (operation_scope = 'TENANT_SCOPE' and tenant_id is not null and account_id is null)
      or (operation_scope = 'DOMAIN_SCOPE' and tenant_id is null and account_id is null)
    ),
  constraint idempotency_records_operation_check
    check (operation in ('INITIAL_PERSONAL_BOOTSTRAP')),
  constraint idempotency_records_actor_kind_check
    check (actor_kind in ('USER_PRINCIPAL', 'SYSTEM_ACTOR')),
  constraint idempotency_records_actor_principal_check
    check (
      (actor_kind = 'USER_PRINCIPAL' and principal_id is not null)
      or (actor_kind = 'SYSTEM_ACTOR' and principal_id is null)
    ),
  constraint idempotency_records_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint idempotency_records_idempotency_key_check
    check (char_length(idempotency_key) between 16 and 512),
  constraint idempotency_records_material_request_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$'),
  constraint idempotency_records_correlation_id_check
    check (char_length(correlation_id) between 16 and 512),
  constraint idempotency_records_status_check
    check (status in ('STARTED', 'SUCCEEDED', 'FAILED', 'CONFLICT')),
  constraint idempotency_records_completion_check
    check ((status in ('SUCCEEDED', 'FAILED', 'CONFLICT')) = (completed_at is not null)),
  constraint idempotency_records_operation_key
    unique (actor_kind, actor_id, operation_scope, operation, idempotency_key)
);

create table investing.audit_events (
  audit_event_id uuid primary key default gen_random_uuid(),
  correlation_id text not null,
  actor_kind text not null,
  actor_id text not null,
  principal_id uuid references investing.principals (principal_id),
  operation_scope text not null,
  tenant_id uuid references investing.tenants (tenant_id),
  account_id uuid,
  action text not null,
  object_type text not null,
  object_id text,
  outcome text not null,
  reason_code text,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint audit_events_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint audit_events_operation_scope_check
    check (operation_scope in ('ACCOUNT_SCOPE', 'TENANT_SCOPE', 'DOMAIN_SCOPE')),
  constraint audit_events_scope_identity_check
    check (
      (operation_scope = 'ACCOUNT_SCOPE' and tenant_id is not null and account_id is not null)
      or (operation_scope = 'TENANT_SCOPE' and tenant_id is not null and account_id is null)
      or (operation_scope = 'DOMAIN_SCOPE' and tenant_id is null and account_id is null)
    ),
  constraint audit_events_actor_kind_check
    check (actor_kind in ('USER_PRINCIPAL', 'SYSTEM_ACTOR')),
  constraint audit_events_actor_principal_check
    check (
      (actor_kind = 'USER_PRINCIPAL' and principal_id is not null)
      or (actor_kind = 'SYSTEM_ACTOR' and principal_id is null)
    ),
  constraint audit_events_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint audit_events_correlation_id_check
    check (char_length(correlation_id) between 16 and 512),
  constraint audit_events_action_check
    check (action in (
      'AUTHORITY_BOOTSTRAP_REQUESTED',
      'AUTHORITY_BOOTSTRAP_SUCCEEDED',
      'AUTHORITY_BOOTSTRAP_FAILED',
      'AUTHORITY_ACCESS_DENIED'
    )),
  constraint audit_events_object_type_check
    check (object_type in (
      'PRINCIPAL',
      'TENANT',
      'TENANT_MEMBERSHIP',
      'ACCOUNT',
      'ACCOUNT_ACCESS',
      'IDEMPOTENCY_RECORD'
    )),
  constraint audit_events_outcome_check
    check (outcome in ('SUCCEEDED', 'FAILED', 'DENIED', 'CONFLICT')),
  constraint audit_events_reason_code_check
    check (reason_code is null or char_length(reason_code) between 1 and 128),
  constraint audit_events_recorded_after_occurred_check
    check (recorded_at >= occurred_at)
);

alter table investing.principals enable row level security;
alter table investing.tenants enable row level security;
alter table investing.tenant_memberships enable row level security;
alter table investing.accounts enable row level security;
alter table investing.account_access enable row level security;
alter table investing.idempotency_records enable row level security;
alter table investing.audit_events enable row level security;

alter table investing.principals force row level security;
alter table investing.tenants force row level security;
alter table investing.tenant_memberships force row level security;
alter table investing.accounts force row level security;
alter table investing.account_access force row level security;
alter table investing.idempotency_records force row level security;
alter table investing.audit_events force row level security;

revoke all on all tables in schema investing from public, anon, authenticated, service_role, investing_app;
revoke all on all sequences in schema investing from public, anon, authenticated, service_role, investing_app;
revoke all on all functions in schema investing from public, anon, authenticated, service_role, investing_app;

grant select, insert on table investing.principals to investing_app;
grant select, insert on table investing.tenants to investing_app;
grant select, insert on table investing.tenant_memberships to investing_app;
grant select, insert on table investing.accounts to investing_app;
grant select, insert on table investing.account_access to investing_app;

grant select, insert on table investing.idempotency_records to investing_app;
grant update (status, canonical_result_reference, error_code, updated_at, completed_at)
  on table investing.idempotency_records to investing_app;

grant select, insert on table investing.audit_events to investing_app;

reset role;

revoke create on database postgres from investing_owner;

do $$
declare
  v_bad_count integer;
  v_role record;
begin
  select *
    into v_role
  from pg_catalog.pg_roles
  where rolname = 'investing_owner';

  if not found
    or v_role.rolcanlogin
    or v_role.rolinherit
    or v_role.rolsuper
    or v_role.rolcreatedb
    or v_role.rolcreaterole
    or v_role.rolreplication
    or v_role.rolbypassrls then
    raise exception 'I2-A postcondition violation: investing_owner attributes mismatch';
  end if;

  select *
    into v_role
  from pg_catalog.pg_roles
  where rolname = 'investing_app';

  if not found
    or not v_role.rolcanlogin
    or v_role.rolinherit
    or v_role.rolsuper
    or v_role.rolcreatedb
    or v_role.rolcreaterole
    or v_role.rolreplication
    or v_role.rolbypassrls then
    raise exception 'I2-A postcondition violation: investing_app attributes mismatch';
  end if;

  if has_schema_privilege('investing_app', 'investing', 'CREATE') then
    raise exception 'I2-A postcondition violation: investing_app can CREATE in investing schema';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_namespace n
  join pg_catalog.pg_roles r on r.oid = n.nspowner
  where n.nspname = 'investing'
    and r.rolname = 'investing_owner';

  if v_bad_count <> 1 then
    raise exception 'I2-A postcondition violation: investing schema owner mismatch';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles member on member.oid = m.member
  where member.rolname = 'investing_app';

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: investing_app has role memberships';
  end if;

  with recursive membership_path(role_oid, role_name, path) as (
    select r.oid, r.rolname, array[r.rolname]
    from pg_catalog.pg_roles r
    where r.rolname = 'investing_app'
    union all
    select parent.oid, parent.rolname, membership_path.path || parent.rolname
    from membership_path
    join pg_catalog.pg_auth_members m on m.member = membership_path.role_oid
    join pg_catalog.pg_roles parent on parent.oid = m.roleid
    where not parent.rolname = any(membership_path.path)
  )
  select count(*)
    into v_bad_count
  from membership_path
  where role_name in (
    'investing_owner',
    'postgres',
    'service_role',
    'authenticator',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin'
  );

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: investing_app has transitive privileged role membership';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and r.rolname = 'investing_app';

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: investing_app owns persistent relation objects';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and (
      r.rolname <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: authority tables must be investing_owner-owned with RLS and FORCE RLS';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing';

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: I2-A must not create permissive or runtime policies';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) as blocked(role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privilege(name)
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and has_table_privilege(blocked.role_name, c.oid, privilege.name);

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: blocked roles have table privileges on investing objects';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('investing_app')) as blocked(role_name)
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as privilege(name)
  where n.nspname = 'investing'
    and c.relkind = 'S'
    and has_sequence_privilege(blocked.role_name, c.oid, privilege.name);

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: blocked roles have sequence privileges on investing objects';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('SELECT'), ('INSERT')) as privilege(name)
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'idempotency_records',
      'audit_events'
    )
    and not has_table_privilege('investing_app', c.oid, privilege.name);

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: investing_app missing explicit table privileges';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privilege(name)
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and has_table_privilege('investing_app', c.oid, privilege.name);

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: investing_app has forbidden table privileges';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_roles r on r.oid = d.defaclrole
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) acl
  where r.rolname = 'investing_owner'
    and d.defaclobjtype = 'f'
    and acl.grantee = 0
    and acl.privilege_type = 'EXECUTE'
    and (n.nspname is null or n.nspname = 'investing');

  if v_bad_count <> 0 then
    raise exception 'I2-A postcondition violation: investing_owner default function ACL grants PUBLIC EXECUTE';
  end if;
end $$;

commit;
