-- SYNTRAKE INVESTING GENESIS I3-A PROMOTION HARDENING
-- SOURCE CONSOLIDATION PATCH ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
--
-- This patch closes the two promotion blockers recorded in
-- docs/investing-genesis/I3A_IMPLEMENTATION_CHECKPOINT.md.
-- It MUST be folded into the promoted I3-A migration source. Applying this file
-- after I3-A has already created its routines would not prove the required
-- fail-closed prestate and therefore is not a valid substitute for consolidation.

-- ---------------------------------------------------------------------------
-- 1. PRE-MUTATION FAIL-CLOSED ROUTINE PRESTATE
-- Insert this check into the initial I3-A prestate DO block before SET ROLE.
-- ---------------------------------------------------------------------------

-- Required prestate clause:
--
-- if exists (
--   select 1
--   from pg_catalog.pg_proc p
--   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'investing'
--     and p.proname like 'i3_%'
-- ) then
--   raise exception 'I3-A prestate violation: I3 routines already exist';
-- end if;

-- ---------------------------------------------------------------------------
-- 2. CANONICAL DECIMAL VALIDATORS
-- Replace the three CREATE OR REPLACE definitions in the I3-A candidate with
-- these exact CREATE FUNCTION definitions. NULL is an explicit validation
-- failure; no caller may interpret SQL NULL as accepted financial input.
-- ---------------------------------------------------------------------------

create function investing.i3_is_canonical_quantity_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and p_value ~ '^(?:[1-9][0-9]{0,19}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$';
$$;

create function investing.i3_is_canonical_positive_money_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and p_value ~ '^(?:[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$';
$$;

create function investing.i3_is_canonical_nonnegative_money_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and (
      p_value = '0'
      or p_value ~ '^(?:[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$'
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. EXACT POSTCONDITION ROUTINE INVENTORY
-- Add this block to the promoted I3-A postconditions after all I3-A routines
-- have been created and their PUBLIC/shared/runtime EXECUTE revoked.
-- ---------------------------------------------------------------------------

-- Required postcondition clause:
--
-- declare
--   v_i3_routines text[];
-- begin
--   select array_agg(
--     p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
--     order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
--   )
--     into v_i3_routines
--   from pg_catalog.pg_proc p
--   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
--   join pg_catalog.pg_roles r on r.oid = p.proowner
--   where n.nspname = 'investing'
--     and p.proname like 'i3_%'
--     and r.rolname = 'investing_owner';
--
--   if v_i3_routines is distinct from array[
--     'i3_accounting_genesis_anchor_insert_guard()',
--     'i3_accounting_revision_insert_guard()',
--     'i3_accounting_revision_seal_guard()',
--     'i3_allocation_insert_guard()',
--     'i3_append_only_guard()',
--     'i3_fill_accounting_effect_commit_guard()',
--     'i3_fill_insert_guard()',
--     'i3_is_canonical_nonnegative_money_v1(p_value text)',
--     'i3_is_canonical_positive_money_v1(p_value text)',
--     'i3_is_canonical_quantity_v1(p_value text)',
--     'i3_lot_origin_insert_guard()',
--     'i3_revision_commit_guard()'
--   ]::text[] then
--     raise exception 'I3-A postcondition violation: unexpected I3 routine inventory: %', v_i3_routines;
--   end if;
--
--   if exists (
--     select 1
--     from pg_catalog.pg_proc p
--     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
--     join pg_catalog.pg_roles r on r.oid = p.proowner
--     where n.nspname = 'investing'
--       and p.proname like 'i3_%'
--       and (
--         r.rolname <> 'investing_owner'
--         or p.prosecdef
--         or pg_catalog.array_to_string(p.proconfig, ',') is distinct from 'search_path=pg_catalog'
--       )
--   ) then
--     raise exception 'I3-A postcondition violation: I3 routine ownership/security/search_path drift';
--   end if;
--
--   if investing.i3_is_canonical_quantity_v1(null)
--     or investing.i3_is_canonical_positive_money_v1(null)
--     or investing.i3_is_canonical_nonnegative_money_v1(null) then
--     raise exception 'I3-A postcondition violation: NULL decimal text must fail closed';
--   end if;
-- end;

-- Promotion rule:
--
-- I3-A remains NOT PROMOTABLE until the canonical candidate itself contains the
-- clauses above and no CREATE OR REPLACE FUNCTION investing.i3_% statement.
