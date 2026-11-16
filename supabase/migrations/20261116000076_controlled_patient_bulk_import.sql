begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('patient.import.stage','Stage patient records from a controlled import',true),
 ('patient.import.review','Review and approve staged patient records',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('records_officer','patient.import.stage','facility'),('records_officer','patient.import.review','facility'),
 ('super_admin','patient.import.stage','global'),('super_admin','patient.import.review','global')
on conflict do nothing;

create table if not exists public.patient_import_batches(
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 source_name text not null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 status text not null default 'staged' check(status in ('staged','partially_approved','approved','rolled_back')),
 rolled_back_at timestamptz, rolled_back_by uuid references public.profiles(id), rollback_reason text,
 check((status='rolled_back' and rolled_back_at is not null and rolled_back_by is not null) or (status<>'rolled_back' and rolled_back_at is null and rolled_back_by is null))
);
create table if not exists public.patient_import_rows(
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.patient_import_batches(id) on delete restrict,
 source_record_key text not null, row_number integer not null, raw_data jsonb not null,
 validation_errors jsonb not null default '[]'::jsonb, duplicate_candidates jsonb not null default '[]'::jsonb,
 status text not null default 'pending' check(status in ('pending','approved','skipped','rolled_back')),
 reviewer_id uuid references public.profiles(id), reviewed_at timestamptz, review_decision text,
 near_match_reason text, created_patient_id uuid references public.patients(id) on delete restrict,
 created_at timestamptz not null default now(), unique(batch_id,source_record_key), unique(batch_id,row_number),
 check((status='pending' and reviewer_id is null and reviewed_at is null and created_patient_id is null) or
       (status in ('approved','skipped','rolled_back') and reviewer_id is not null and reviewed_at is not null)),
 check(status<>'approved' or created_patient_id is not null)
);
create unique index if not exists patient_import_source_global_uidx on public.patient_import_rows(source_record_key);
create index if not exists patient_import_review_queue_idx on public.patient_import_batches(facility_id,status,created_at desc);
create index if not exists patient_import_rows_batch_idx on public.patient_import_rows(batch_id,status,row_number);
do $$ declare t text; begin foreach t in array array['patient_import_batches','patient_import_rows'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert,update on public.%I to service_role',t);
 execute format('drop trigger if exists audit_%I on public.%I',t,t);
 execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop; end $$;
drop policy if exists patient_import_batch_read on public.patient_import_batches;
create policy patient_import_batch_read on public.patient_import_batches for select to authenticated using(public.has_org_permission('patient.import.review',facility_id,null) or public.has_org_permission('patient.import.stage',facility_id,null));
drop policy if exists patient_import_row_read on public.patient_import_rows;
create policy patient_import_row_read on public.patient_import_rows for select to authenticated using(exists(select 1 from public.patient_import_batches b where b.id=batch_id and (public.has_org_permission('patient.import.review',b.facility_id,null) or public.has_org_permission('patient.import.stage',b.facility_id,null))));

create or replace function public.stage_patient_import(p_facility_id uuid,p_operator_profile_id uuid,p_source_name text,p_rows jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; batch uuid; r jsonb; n integer:=0; key text; errors jsonb; candidates jsonb; dob date; phone text; full_name text;
begin
 if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
 if not exists(select 1 from public.facilities where id=p_facility_id) or nullif(btrim(p_source_name),'') is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Facility, source name, and non-empty row array are required'; end if;
 actor:=p_operator_profile_id;
 if not exists(select 1 from public.profiles where id=actor and status::text='active' and role::text in ('records_officer','super_admin')) then raise exception 'An active records officer or Super Admin operator profile is required'; end if;
 select existing.batch_id into batch from public.patient_import_rows existing where existing.source_record_key in (select value->>'source_record_key' from jsonb_array_elements(p_rows)) limit 1;
 if batch is not null then
  if exists(select 1 from public.patient_import_rows existing where existing.source_record_key in (select value->>'source_record_key' from jsonb_array_elements(p_rows)) and existing.batch_id<>batch)
    or (select count(*) from public.patient_import_rows existing where existing.batch_id=batch and existing.source_record_key in (select value->>'source_record_key' from jsonb_array_elements(p_rows)))<>jsonb_array_length(p_rows) then
    raise exception 'One or more source_record_key values were already staged in a different import; keys are immutable and globally unique';
  end if;
  return batch;
 end if;
 insert into public.patient_import_batches(facility_id,source_name,created_by) values(p_facility_id,btrim(p_source_name),actor) returning id into batch;
 for r in select value from jsonb_array_elements(p_rows) loop
  n:=n+1; key:=nullif(btrim(r->>'source_record_key'),''); errors:='[]'::jsonb;
  if key is null then errors:=errors||jsonb_build_array('source_record_key is required'); end if;
  if nullif(btrim(r->>'first_name'),'') is null then errors:=errors||jsonb_build_array('first_name is required'); end if;
  if nullif(btrim(r->>'last_name'),'') is null then errors:=errors||jsonb_build_array('last_name is required'); end if;
  if coalesce(r->>'date_of_birth','') !~ '^\d{4}-\d{2}-\d{2}$' then errors:=errors||jsonb_build_array('date_of_birth must be YYYY-MM-DD');
  else begin dob:=(r->>'date_of_birth')::date; exception when others then errors:=errors||jsonb_build_array('date_of_birth is not a valid calendar date'); end; end if;
  if exists(select 1 from public.patient_import_rows where source_record_key=key) then errors:=errors||jsonb_build_array('source_record_key was already staged'); end if;
  if (select count(*) from jsonb_array_elements(p_rows) x(value) where x.value->>'source_record_key'=key)>1 then errors:=errors||jsonb_build_array('source_record_key is repeated in this file'); end if;
  candidates:='[]'::jsonb; phone:=regexp_replace(coalesce(r->>'phone',''),'\D','','g'); full_name:=lower(regexp_replace(btrim(coalesce(r->>'first_name','')||' '||coalesce(r->>'last_name','')),'\s+',' ','g'));
  if errors='[]'::jsonb then
   select coalesce(jsonb_agg(jsonb_build_object(
     'patient_id',p.id,
     'match_type',case when exact_match then 'exact' when phone_match then 'phone' when name_score>=0.45 then 'similar_name' else 'name_and_birth_date' end,
     'exact_match',exact_match,'match_score',greatest(name_score,case when phone_match then 1 else 0 end)
   ) order by p.id),'[]'::jsonb) into candidates
   from public.patients p cross join lateral (select
     (p.national_id_hash=nullif(r->>'national_id_hash','') or (p.date_of_birth=dob and lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g'))=full_name and length(phone)>=7 and regexp_replace(coalesce(p.phone,''),'\D','','g')=phone)) as exact_match,
     (length(phone)>=7 and regexp_replace(coalesce(p.phone,''),'\D','','g')=phone) as phone_match,
     similarity(lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g')),full_name) as name_score) matches
   where p.identity_status is distinct from 'merged' and (p.home_facility_id=p_facility_id or public.has_patient_facility_access(p.id)) and
    (p.national_id_hash=nullif(r->>'national_id_hash','') or (p.date_of_birth=dob and lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g'))=full_name) or (length(phone)>=7 and regexp_replace(coalesce(p.phone,''),'\D','','g')=phone) or similarity(lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g')),full_name)>=0.45);
  end if;
  insert into public.patient_import_rows(batch_id,source_record_key,row_number,raw_data,validation_errors,duplicate_candidates)
  values(batch,coalesce(key,'INVALID-'||n),n,r,errors,candidates);
 end loop;
 return batch;
end $$;

create or replace function public.review_patient_import_batch(p_batch_id uuid,p_rows jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare actor uuid; b public.patient_import_batches%rowtype; x jsonb; row public.patient_import_rows%rowtype; r jsonb; new_id uuid; decision text; count_done integer:=0;
begin
 actor:=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active');
 select * into b from public.patient_import_batches where id=p_batch_id for update;
 if actor is null or b.id is null or not public.has_org_permission('patient.import.review',b.facility_id,null) or b.status in ('approved','rolled_back') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Authorized reviewer and open batch with review decisions required'; end if;
 for x in select value from jsonb_array_elements(p_rows) loop
  select * into row from public.patient_import_rows where id=(x->>'row_id')::uuid and batch_id=b.id for update;
  decision:=x->>'decision';
  if row.id is null or row.status<>'pending' then raise exception 'Review row is missing or no longer pending'; end if;
  if decision='skip' then update public.patient_import_rows set status='skipped',reviewer_id=actor,reviewed_at=now(),review_decision='skip' where id=row.id; count_done:=count_done+1; continue; end if;
  if decision<>'approve' or jsonb_array_length(row.validation_errors)>0 then raise exception 'Only valid rows can be approved'; end if;
  if exists(select 1 from jsonb_array_elements(row.duplicate_candidates) c where (c->>'exact_match')::boolean) then raise exception 'Exact duplicate candidate exists; skip this row and use the existing patient record'; end if;
  if jsonb_array_length(row.duplicate_candidates)>0 and length(btrim(coalesce(x->>'near_match_reason','')))<10 then raise exception 'Document at least 10 characters explaining why this near match is a different person'; end if;
  r:=row.raw_data;
  insert into public.patients(patient_number,first_name,last_name,date_of_birth,gender,phone,email,address,blood_group,emergency_contact_name,emergency_contact_phone,home_facility_id,status,allergies,chronic_conditions,national_id_hash)
  values(nullif(r->>'patient_number',''),btrim(r->>'first_name'),btrim(r->>'last_name'),(r->>'date_of_birth')::date,nullif(r->>'gender',''),nullif(r->>'phone',''),nullif(r->>'email',''),nullif(r->>'address',''),nullif(r->>'blood_group',''),nullif(r->>'emergency_contact_name',''),nullif(r->>'emergency_contact_phone',''),b.facility_id,'active',coalesce(nullif(r->>'allergies',''),'None'),coalesce(nullif(r->>'chronic_conditions',''),'None'),nullif(r->>'national_id_hash','')) returning id into new_id;
  update public.patient_import_rows set status='approved',reviewer_id=actor,reviewed_at=now(),review_decision='approve',near_match_reason=nullif(btrim(x->>'near_match_reason'),''),created_patient_id=new_id where id=row.id;
  count_done:=count_done+1;
 end loop;
 update public.patient_import_batches set status=case when not exists(select 1 from public.patient_import_rows where batch_id=b.id and status='pending') then 'approved' else 'partially_approved' end where id=b.id;
 return count_done;
end $$;

create or replace function public.rollback_patient_import_batch(p_batch_id uuid,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$
declare actor uuid; b public.patient_import_batches%rowtype; n integer; imported record; fk record; has_dependents boolean; imported_patient_ids uuid[];
begin
 actor:=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active'); select * into b from public.patient_import_batches where id=p_batch_id for update;
 if actor is null or b.id is null or not public.has_org_permission('patient.import.review',b.facility_id,null) or b.status='rolled_back' or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Authorized reviewer and documented rollback reason required'; end if;
 select coalesce(array_agg(p.id),'{}'::uuid[]) into imported_patient_ids from public.patient_import_rows r join public.patients p on p.id=r.created_patient_id where r.batch_id=b.id and r.status='approved';
 for imported in select p.id from public.patient_import_rows r join public.patients p on p.id=r.created_patient_id where r.batch_id=b.id and r.status='approved' loop
  for fk in select ns.nspname schema_name,rel.relname table_name,att.attname column_name
    from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace ns on ns.oid=rel.relnamespace
    join pg_attribute att on att.attrelid=rel.oid and att.attnum=con.conkey[1]
    where con.contype='f' and con.confrelid='public.patients'::regclass and array_length(con.conkey,1)=1
      and rel.oid not in ('public.patients'::regclass,'public.patient_import_rows'::regclass) loop
   execute format('select exists(select 1 from %I.%I where %I=$1)',fk.schema_name,fk.table_name,fk.column_name) into has_dependents using imported.id;
   if has_dependents then raise exception 'Rollback refused: imported patient % has dependent rows in %.%',imported.id,fk.schema_name,fk.table_name; end if;
  end loop;
 end loop;
 -- Keep the quarantine audit row while releasing its restrictive patient FK.
 update public.patient_import_rows set status='rolled_back',created_patient_id=null where batch_id=b.id and status='approved';
 delete from public.patients where id=any(imported_patient_ids);
 get diagnostics n=row_count;
 update public.patient_import_rows set status='rolled_back' where batch_id=b.id and status in ('approved','skipped');
 update public.patient_import_batches set status='rolled_back',rolled_back_at=now(),rolled_back_by=actor,rollback_reason=btrim(p_reason) where id=b.id; return n;
end $$;
revoke all on function public.stage_patient_import(uuid,uuid,text,jsonb),public.review_patient_import_batch(uuid,jsonb),public.rollback_patient_import_batch(uuid,text) from public,anon,authenticated;
grant execute on function public.stage_patient_import(uuid,uuid,text,jsonb),public.review_patient_import_batch(uuid,jsonb),public.rollback_patient_import_batch(uuid,text) to service_role;
grant execute on function public.review_patient_import_batch(uuid,jsonb),public.rollback_patient_import_batch(uuid,text) to authenticated;
commit;
