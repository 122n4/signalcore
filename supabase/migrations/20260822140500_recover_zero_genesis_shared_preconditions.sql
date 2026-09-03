begin;

do $zero_genesis_shared_preconditions$
declare
  v_setup_oid oid;
  v_function_oid oid;
  v_constraint_oid oid;
  v_count integer;
  v_definition text;
  v_body text;
  v_created_function boolean := false;
begin
  if to_regclass('public.plans') is null then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.plans is missing';
  end if;

  if to_regclass('public.portfolio_items') is null then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.portfolio_items is missing';
  end if;

  if not exists (
    select 1
      from pg_attribute a
     where a.attrelid = 'public.plans'::regclass
       and a.attname = 'mode'
       and a.atttypid = 'text'::regtype
       and a.attnum > 0
       and not a.attisdropped
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.plans.mode text column is missing';
  end if;

  if not exists (
    select 1
      from pg_attribute a
     where a.attrelid = 'public.portfolio_items'::regclass
       and a.attname = 'mode'
       and a.atttypid = 'text'::regtype
       and a.attnum > 0
       and not a.attisdropped
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.portfolio_items.mode text column is missing';
  end if;

  v_setup_oid := to_regclass('public.setup_status');

  if v_setup_oid is null then
    execute $ddl$
      create table public.setup_status (
        user_id text primary key,
        completed boolean not null default false,
        mode text,
        updated_at timestamptz default now()
      )
    $ddl$;
    execute 'alter table public.setup_status enable row level security';
    execute 'grant all privileges on table public.setup_status to service_role';
    v_setup_oid := 'public.setup_status'::regclass;
  end if;

  select count(*)
    into v_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.oid = v_setup_oid
     and n.nspname = 'public'
     and c.relname = 'setup_status'
     and c.relkind = 'r'
     and c.relowner = 'postgres'::regrole
     and c.relrowsecurity
     and not c.relforcerowsecurity;

  if v_count <> 1 then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status table identity/owner/RLS differs from canonical Production';
  end if;

  select count(*)
    into v_count
    from pg_attribute a
   where a.attrelid = v_setup_oid
     and a.attnum > 0
     and not a.attisdropped;

  if v_count <> 4 then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status must contain exactly four columns';
  end if;

  if not exists (
    select 1
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = v_setup_oid
       and a.attname = 'user_id'
       and a.atttypid = 'text'::regtype
       and a.attnotnull
       and d.oid is null
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status.user_id differs from canonical Production';
  end if;

  if not exists (
    select 1
      from pg_attribute a
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = v_setup_oid
       and a.attname = 'completed'
       and a.atttypid = 'boolean'::regtype
       and a.attnotnull
       and pg_get_expr(d.adbin, d.adrelid) = 'false'
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status.completed differs from canonical Production';
  end if;

  if not exists (
    select 1
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = v_setup_oid
       and a.attname = 'mode'
       and a.atttypid = 'text'::regtype
       and not a.attnotnull
       and d.oid is null
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status.mode differs from canonical Production';
  end if;

  if not exists (
    select 1
      from pg_attribute a
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = v_setup_oid
       and a.attname = 'updated_at'
       and a.atttypid = 'timestamptz'::regtype
       and not a.attnotnull
       and pg_get_expr(d.adbin, d.adrelid) = 'now()'
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status.updated_at differs from canonical Production';
  end if;

  select count(*)
    into v_count
    from pg_constraint c
   where c.conrelid = v_setup_oid
     and c.contype = 'p'
     and c.conname = 'setup_status_pkey'
     and pg_get_constraintdef(c.oid, true) = 'PRIMARY KEY (user_id)';

  if v_count <> 1 then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status primary key differs from canonical Production';
  end if;

  if exists (
    select 1
      from pg_constraint c
     where c.conrelid = v_setup_oid
       and not (c.contype = 'p' and c.conname = 'setup_status_pkey')
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status has unexpected constraints';
  end if;

  if exists (
    select 1
      from pg_policy p
     where p.polrelid = v_setup_oid
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status must not have RLS policies';
  end if;

  if exists (
    select 1
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      left join pg_roles r on r.oid = acl.grantee
     where c.oid = v_setup_oid
       and coalesce(r.rolname, 'PUBLIC') not in ('postgres', 'service_role')
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.setup_status has an unexpected grantee';
  end if;

  foreach v_definition in array array['INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if not exists (
      select 1
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        join pg_roles r on r.oid = acl.grantee
       where c.oid = v_setup_oid
         and r.rolname = 'postgres'
         and acl.privilege_type = v_definition
    ) then
      raise exception 'Zero Genesis shared-precondition recovery failed: postgres lost % on public.setup_status', v_definition;
    end if;

    if not exists (
      select 1
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        join pg_roles r on r.oid = acl.grantee
       where c.oid = v_setup_oid
         and r.rolname = 'service_role'
         and acl.privilege_type = v_definition
    ) then
      raise exception 'Zero Genesis shared-precondition recovery failed: service_role lacks % on public.setup_status', v_definition;
    end if;
  end loop;

  v_function_oid := to_regprocedure('public.set_updated_at()');

  if v_function_oid is null then
    execute $ddl$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $fn$
      begin
        new.updated_at = now();
        return new;
      end;
      $fn$
    $ddl$;
    execute 'grant execute on function public.set_updated_at() to postgres, anon, authenticated, service_role';
    v_created_function := true;
    v_function_oid := 'public.set_updated_at()'::regprocedure;
  end if;

  select regexp_replace(lower(btrim(p.prosrc)), '\s+', ' ', 'g')
    into v_body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where p.oid = v_function_oid
     and n.nspname = 'public'
     and p.proname = 'set_updated_at'
     and p.pronargs = 0
     and p.prorettype = 'trigger'::regtype
     and p.proowner = 'postgres'::regrole
     and not p.prosecdef
     and p.prokind = 'f'
     and l.lanname = 'plpgsql';

  if v_body is distinct from 'begin new.updated_at = now(); return new; end;' then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.set_updated_at() semantics differ from canonical Production';
  end if;

  foreach v_definition in array array['postgres','anon','authenticated','service_role'] loop
    if not exists (
      select 1
        from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        join pg_roles r on r.oid = acl.grantee
       where p.oid = v_function_oid
         and r.rolname = v_definition
         and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'Zero Genesis shared-precondition recovery failed: role % lacks EXECUTE on public.set_updated_at()', v_definition;
    end if;
  end loop;

  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      left join pg_roles r on r.oid = acl.grantee
     where p.oid = v_function_oid
       and coalesce(r.rolname, 'PUBLIC') not in ('PUBLIC','postgres','anon','authenticated','service_role')
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: public.set_updated_at() has an unexpected EXECUTE grantee';
  end if;

  if v_created_function and not exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where p.oid = v_function_oid
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: newly recovered public.set_updated_at() lacks the historical PUBLIC EXECUTE precondition';
  end if;

  select c.oid
    into v_constraint_oid
    from pg_constraint c
   where c.conrelid = 'public.plans'::regclass
     and c.conname = 'plans_mode_check';

  if v_constraint_oid is null then
    execute $ddl$
      alter table public.plans
      add constraint plans_mode_check
      check (mode in ('trading','forex','crypto'))
    $ddl$;
  else
    select pg_get_constraintdef(v_constraint_oid, true) into v_definition;
    if v_definition <> 'CHECK (mode = ANY (ARRAY[''trading''::text, ''forex''::text, ''crypto''::text]))' then
      raise exception 'Zero Genesis shared-precondition recovery failed: existing plans_mode_check is not the canonical post-Genesis definition: %', v_definition;
    end if;
  end if;

  select c.oid
    into v_constraint_oid
    from pg_constraint c
   where c.conrelid = 'public.portfolio_items'::regclass
     and c.conname = 'portfolio_items_mode_check';

  if v_constraint_oid is null then
    execute $ddl$
      alter table public.portfolio_items
      add constraint portfolio_items_mode_check
      check (mode in ('trading','forex','crypto'))
    $ddl$;
  else
    select pg_get_constraintdef(v_constraint_oid, true) into v_definition;
    if v_definition <> 'CHECK (mode = ANY (ARRAY[''trading''::text, ''forex''::text, ''crypto''::text]))' then
      raise exception 'Zero Genesis shared-precondition recovery failed: existing portfolio_items_mode_check is not the canonical post-Genesis definition: %', v_definition;
    end if;
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.plans'::regclass
       and c.conname = 'plans_mode_check'
       and c.contype = 'c'
       and c.convalidated
       and pg_get_constraintdef(c.oid, true) = 'CHECK (mode = ANY (ARRAY[''trading''::text, ''forex''::text, ''crypto''::text]))'
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: plans_mode_check postcondition failed';
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.portfolio_items'::regclass
       and c.conname = 'portfolio_items_mode_check'
       and c.contype = 'c'
       and c.convalidated
       and pg_get_constraintdef(c.oid, true) = 'CHECK (mode = ANY (ARRAY[''trading''::text, ''forex''::text, ''crypto''::text]))'
  ) then
    raise exception 'Zero Genesis shared-precondition recovery failed: portfolio_items_mode_check postcondition failed';
  end if;
end;
$zero_genesis_shared_preconditions$;

commit;
