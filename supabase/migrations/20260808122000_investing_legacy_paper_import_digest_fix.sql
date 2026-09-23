begin;
do $$
declare
  v_function regprocedure := 'public.investing_import_legacy_paper_v1(text,text,text,text)'::regprocedure;
  v_definition text;
  v_unsafe text := 'encode(digest(convert_to(';
  v_safe text := 'encode(extensions.digest(convert_to(';
begin
  select pg_get_functiondef(v_function) into v_definition;
  if v_definition is null then
    raise exception 'investing_legacy_import_digest_fix_refused';
  elsif position(v_safe in v_definition)>0 then
    return;
  elsif position(v_unsafe in v_definition)>0 then
    execute replace(v_definition,v_unsafe,v_safe);
    return;
  end if;
  raise exception 'investing_legacy_import_digest_fix_refused';
end;
$$;
commit;
