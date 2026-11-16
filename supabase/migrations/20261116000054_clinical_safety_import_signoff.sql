begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

alter table public.formulary_items add column if not exists import_key text;
create unique index if not exists formulary_items_import_key_uidx on public.formulary_items(import_key) where import_key is not null;
alter table public.drug_interactions add column if not exists import_key text;
create unique index if not exists drug_interactions_import_key_uidx on public.drug_interactions(import_key) where import_key is not null;
alter table public.dose_limits add column if not exists import_key text;
create unique index if not exists dose_limits_import_key_uidx on public.dose_limits(import_key) where import_key is not null;

create table if not exists public.clinical_safety_dataset_signoffs (
  id uuid primary key default gen_random_uuid(),
  dataset_name text not null check(dataset_name in ('formulary','interactions','dose_limits')),
  version text not null,
  source text not null,
  licence_note text not null,
  loaded_by text not null,
  clinical_owner_name text not null,
  clinical_owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  clinical_owner_date date not null,
  signed_off_at timestamptz not null default now(),
  unique(dataset_name,version)
);
alter table public.clinical_safety_dataset_signoffs enable row level security;
revoke all on public.clinical_safety_dataset_signoffs from public,anon,authenticated;
grant select on public.clinical_safety_dataset_signoffs to authenticated;
grant select,insert,update,delete on public.clinical_safety_dataset_signoffs to service_role;
drop policy if exists "super admins read clinical safety signoffs" on public.clinical_safety_dataset_signoffs;
create policy "super admins read clinical safety signoffs" on public.clinical_safety_dataset_signoffs
  for select to authenticated using(public.has_any_role(array['super_admin']::text[]));

create or replace function public.load_clinical_safety_dataset(p_dataset text,p_rows jsonb,p_signoff jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare row_data jsonb; item_a uuid; item_b uuid; item_id uuid; loaded integer:=0; signed date;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_dataset not in ('formulary','interactions','dose_limits') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'Invalid clinical safety dataset payload';
  end if;
  if nullif(trim(p_signoff->>'version'),'') is null or nullif(trim(p_signoff->>'source'),'') is null
     or nullif(trim(p_signoff->>'licence_note'),'') is null or nullif(trim(p_signoff->>'loaded_by'),'') is null
     or nullif(trim(p_signoff->>'clinical_owner_name'),'') is null or nullif(trim(p_signoff->>'clinical_owner_profile_id'),'') is null
     or coalesce(p_signoff->>'clinical_owner_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Complete dataset sign-off metadata is required';
  end if;
  signed := (p_signoff->>'clinical_owner_date')::date;
  if not exists(select 1 from public.profiles where id=(p_signoff->>'clinical_owner_profile_id')::uuid and role::text='super_admin' and status::text='active') then
    raise exception 'Clinical owner must be an active Super Admin profile';
  end if;
  if p_dataset='formulary' then
    for row_data in select value from jsonb_array_elements(p_rows) loop
      if nullif(trim(row_data->>'atc_code'),'') is not null and not exists(select 1 from public.concepts where system='ATC' and code=row_data->>'atc_code' and active) then raise exception 'Unknown ATC code: %',row_data->>'atc_code'; end if;
      insert into public.formulary_items(import_key,atc_code,generic_name,form,strength,unit,route,controlled,active)
      values(row_data->>'import_key',nullif(row_data->>'atc_code',''),row_data->>'generic_name',row_data->>'form',row_data->>'strength',row_data->>'unit',row_data->>'route',coalesce((row_data->>'controlled')::boolean,false),coalesce((row_data->>'active')::boolean,true))
      on conflict(import_key) where import_key is not null do update set atc_code=excluded.atc_code,generic_name=excluded.generic_name,form=excluded.form,strength=excluded.strength,unit=excluded.unit,route=excluded.route,controlled=excluded.controlled,active=excluded.active;
      loaded:=loaded+1;
    end loop;
  elsif p_dataset='interactions' then
    for row_data in select value from jsonb_array_elements(p_rows) loop
      select id into item_a from public.formulary_items where import_key=row_data->>'item_a_code' and active;
      select id into item_b from public.formulary_items where import_key=row_data->>'item_b_code' and active;
      if item_a is null then raise exception 'Unknown formulary code: %',row_data->>'item_a_code'; end if;
      if item_b is null then raise exception 'Unknown formulary code: %',row_data->>'item_b_code'; end if;
      if item_a>item_b then item_a:=item_b; item_b:= (select id from public.formulary_items where import_key=row_data->>'item_a_code'); end if;
      insert into public.drug_interactions(import_key,formulary_item_a,formulary_item_b,severity,interaction_text,approved,approved_by,approved_at)
      values(row_data->>'import_key',item_a,item_b,row_data->>'severity',row_data->>'interaction_text',true,(p_signoff->>'clinical_owner_profile_id')::uuid,now())
      on conflict(import_key) where import_key is not null do update set formulary_item_a=excluded.formulary_item_a,formulary_item_b=excluded.formulary_item_b,severity=excluded.severity,interaction_text=excluded.interaction_text,approved=true,approved_by=excluded.approved_by,approved_at=now();
      loaded:=loaded+1;
    end loop;
  else
    for row_data in select value from jsonb_array_elements(p_rows) loop
      select id into item_id from public.formulary_items where import_key=row_data->>'item_code' and active;
      if item_id is null then raise exception 'Unknown formulary code: %',row_data->>'item_code'; end if;
      insert into public.dose_limits(import_key,formulary_item_id,age_min_months,age_max_months,weight_basis,dose_unit,min_per_dose,max_per_dose,min_per_day,max_per_day,renal_note,pregnancy_note,approved,approved_by,approved_at)
      values(row_data->>'import_key',item_id,nullif(row_data->>'age_min_months','')::integer,nullif(row_data->>'age_max_months','')::integer,coalesce(nullif(row_data->>'weight_basis',''),'fixed'),row_data->>'dose_unit',nullif(row_data->>'min_per_dose','')::numeric,nullif(row_data->>'max_per_dose','')::numeric,nullif(row_data->>'min_per_day','')::numeric,nullif(row_data->>'max_per_day','')::numeric,nullif(row_data->>'renal_note',''),nullif(row_data->>'pregnancy_note',''),true,(p_signoff->>'clinical_owner_profile_id')::uuid,now())
      on conflict(import_key) where import_key is not null do update set formulary_item_id=excluded.formulary_item_id,age_min_months=excluded.age_min_months,age_max_months=excluded.age_max_months,weight_basis=excluded.weight_basis,dose_unit=excluded.dose_unit,min_per_dose=excluded.min_per_dose,max_per_dose=excluded.max_per_dose,min_per_day=excluded.min_per_day,max_per_day=excluded.max_per_day,renal_note=excluded.renal_note,pregnancy_note=excluded.pregnancy_note,approved=true,approved_by=excluded.approved_by,approved_at=now();
      loaded:=loaded+1;
    end loop;
  end if;
  insert into public.clinical_safety_dataset_signoffs(dataset_name,version,source,licence_note,loaded_by,clinical_owner_name,clinical_owner_profile_id,clinical_owner_date)
  values(p_dataset,trim(p_signoff->>'version'),trim(p_signoff->>'source'),trim(p_signoff->>'licence_note'),trim(p_signoff->>'loaded_by'),trim(p_signoff->>'clinical_owner_name'),(p_signoff->>'clinical_owner_profile_id')::uuid,signed)
  on conflict(dataset_name,version) do update set source=excluded.source,licence_note=excluded.licence_note,loaded_by=excluded.loaded_by,clinical_owner_name=excluded.clinical_owner_name,clinical_owner_profile_id=excluded.clinical_owner_profile_id,clinical_owner_date=excluded.clinical_owner_date,signed_off_at=now();
  return loaded;
end $$;
revoke all on function public.load_clinical_safety_dataset(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.load_clinical_safety_dataset(text,jsonb,jsonb) to service_role;

create or replace function public.clinical_safety_status()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'formulary_ready', exists(select 1 from public.formulary_items where active) and exists(select 1 from public.clinical_safety_dataset_signoffs where dataset_name='formulary'),
    'interactions_ready', exists(select 1 from public.drug_interactions where approved) and exists(select 1 from public.clinical_safety_dataset_signoffs where dataset_name='interactions'),
    'dose_limits_ready', exists(select 1 from public.dose_limits where approved) and exists(select 1 from public.clinical_safety_dataset_signoffs where dataset_name='dose_limits')
  )
$$;
revoke all on function public.clinical_safety_status() from public,anon;
grant execute on function public.clinical_safety_status() to authenticated,service_role;
commit;
