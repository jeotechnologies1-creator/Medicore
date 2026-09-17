-- Run this as a SEPARATE SQL Editor query before role_authorization.sql when
-- public.profiles.role uses a legacy enum.
-- It preserves existing values and policies while adding OneMed's role labels.

do $$
declare role_label text; role_type_schema text; role_type_name text;
begin
  select type_namespace.nspname, type_def.typname
    into role_type_schema, role_type_name
  from pg_attribute attribute_def
  join pg_class table_def on table_def.oid = attribute_def.attrelid
  join pg_namespace table_namespace on table_namespace.oid = table_def.relnamespace
  join pg_type type_def on type_def.oid = attribute_def.atttypid
  join pg_namespace type_namespace on type_namespace.oid = type_def.typnamespace
  where table_namespace.nspname = 'public'
    and table_def.relname = 'profiles'
    and attribute_def.attname = 'role'
    and attribute_def.attnum > 0
    and not attribute_def.attisdropped
    and type_def.typtype = 'e';

  if role_type_name is not null then
    foreach role_label in array array[
      'super_admin','doctor','nurse','receptionist','pharmacist',
      'laboratory_scientist','radiographer','accountant','patient'
    ] loop
      execute format('alter type %I.%I add value if not exists %L', role_type_schema, role_type_name, role_label);
    end loop;
  end if;
end $$;
