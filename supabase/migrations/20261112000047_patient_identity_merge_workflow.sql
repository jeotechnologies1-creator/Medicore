begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

create extension if not exists pg_trgm;

create index if not exists patients_identity_name_dob_idx on public.patients(
  lower(regexp_replace(btrim(first_name || ' ' || last_name), '\s+', ' ', 'g')),
  date_of_birth
);
create index if not exists patients_identity_phone_normalized_idx on public.patients(
  regexp_replace(coalesce(phone,''), '\D', '', 'g')
) where phone is not null;
create index if not exists patients_identity_national_hash_idx on public.patients(national_id_hash) where national_id_hash is not null;
create index if not exists patients_identity_name_trgm_idx on public.patients using gin(
  lower(regexp_replace(btrim(first_name || ' ' || last_name), '\s+', ' ', 'g')) gin_trgm_ops
);

create table if not exists public.patient_merge_history (
  id uuid primary key default gen_random_uuid(),
  source_patient_id uuid not null references public.patients(id) on delete restrict,
  survivor_patient_id uuid not null references public.patients(id) on delete restrict,
  reason text not null check(length(btrim(reason)) >= 10),
  merge_type text not null check(merge_type in ('general','unidentified')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  source_identity_snapshot jsonb not null,
  moved_patient_rows jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reversible_until timestamptz not null default (now()+interval '30 days'),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversal_reason text,
  check(source_patient_id<>survivor_patient_id),
  check((reversed_at is null and reversed_by is null) or (reversed_at is not null and reversed_by is not null))
);
create index if not exists patient_merge_history_recent_idx on public.patient_merge_history(created_at desc,source_patient_id);
alter table public.patient_merge_history enable row level security;
revoke all on public.patient_merge_history from public,anon,authenticated;
drop trigger if exists audit_patient_merge_history on public.patient_merge_history;
create trigger audit_patient_merge_history after insert or update or delete on public.patient_merge_history
for each row execute function public.audit_row_change();
create table if not exists public.patient_duplicate_reviews (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
  candidate_patient_ids uuid[] not null, reason text not null check(length(btrim(reason))>=10),
  actor_id uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now()
);
alter table public.patient_duplicate_reviews enable row level security;
revoke all on public.patient_duplicate_reviews from public,anon,authenticated;
drop trigger if exists audit_patient_duplicate_reviews on public.patient_duplicate_reviews;
create trigger audit_patient_duplicate_reviews after insert on public.patient_duplicate_reviews
for each row execute function public.audit_row_change();

create or replace function public.find_patient_duplicate_candidates(
  p_first_name text,p_last_name text,p_date_of_birth date,p_phone text,p_national_id_hash text default null
) returns table(patient jsonb,match_type text,exact_match boolean,match_score numeric)
language sql stable security invoker set search_path=public as $$
  with input as (
    select lower(regexp_replace(btrim(coalesce(p_first_name,'')||' '||coalesce(p_last_name,'')),'\s+',' ','g')) as full_name,
      regexp_replace(coalesce(p_phone,''),'\D','','g') as normalized_phone,
      nullif(btrim(p_national_id_hash),'') as national_hash
  ), matches as (
    select p,
      (i.national_hash is not null and p.national_id_hash=i.national_hash) or
       (p.date_of_birth=p_date_of_birth and lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g'))=i.full_name
         and length(i.normalized_phone)>=7 and regexp_replace(coalesce(p.phone,''),'\D','','g')=i.normalized_phone) as is_exact,
      similarity(lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g')),i.full_name) as name_score,
      (regexp_replace(coalesce(p.phone,''),'\D','','g')=i.normalized_phone and length(i.normalized_phone)>=7) as phone_match,
      p.last_name,p.first_name
    from public.patients p cross join input i
    where p.identity_status is distinct from 'merged'
      and (p.national_id_hash=nullif(btrim(p_national_id_hash),'')
        or (p.date_of_birth=p_date_of_birth and lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g'))=i.full_name)
        or (length(i.normalized_phone)>=7 and regexp_replace(coalesce(p.phone,''),'\D','','g')=i.normalized_phone)
        or similarity(lower(regexp_replace(btrim(p.first_name||' '||p.last_name),'\s+',' ','g')),i.full_name)>=0.45)
      and public.can_read_patient_record(p.id) and public.has_patient_facility_access(p.id)
  )
  select to_jsonb(matches.p),
    case when is_exact then 'exact' when phone_match then 'phone' when name_score>=0.45 then 'similar_name' else 'name_and_birth_date' end,
    is_exact,greatest(name_score,case when phone_match then 1 else 0 end)::numeric
  from matches
  order by is_exact desc,greatest(name_score,case when phone_match then 1 else 0 end) desc,last_name,first_name
  limit 20;
$$;
revoke all on function public.find_patient_duplicate_candidates(text,text,date,text,text) from public,anon;
grant execute on function public.find_patient_duplicate_candidates(text,text,date,text,text) to authenticated;

create or replace function public.reject_exact_patient_duplicate() returns trigger
language plpgsql set search_path=public as $$
declare normalized_name text; normalized_phone text;
begin
  normalized_name:=lower(regexp_replace(btrim(coalesce(new.first_name,'')||' '||coalesce(new.last_name,'')),'\s+',' ','g'));
  normalized_phone:=regexp_replace(coalesce(new.phone,''),'\D','','g');
  if new.national_id_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('patient-national:'||new.national_id_hash,0));
    if exists(select 1 from public.patients p where p.id is distinct from new.id and p.national_id_hash=new.national_id_hash and p.identity_status is distinct from 'merged') then
      raise exception using errcode='23505',message='An exact national identity match already exists. Choose the existing patient record.';
    end if;
  end if;
  if new.date_of_birth is not null and length(normalized_phone)>=7 then
    perform pg_advisory_xact_lock(hashtextextended('patient-demographic:'||normalized_name||':'||new.date_of_birth::text||':'||normalized_phone,0));
    if exists(select 1 from public.patients p where p.id is distinct from new.id and p.date_of_birth=new.date_of_birth
      and lower(regexp_replace(btrim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),'\s+',' ','g'))=normalized_name
      and regexp_replace(coalesce(p.phone,''),'\D','','g')=normalized_phone and p.identity_status is distinct from 'merged') then
      raise exception using errcode='23505',message='An exact name, date of birth, and phone match already exists. Choose the existing patient record.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists prevent_exact_patient_duplicate on public.patients;
create trigger prevent_exact_patient_duplicate before insert or update of first_name,last_name,date_of_birth,phone,national_id_hash
on public.patients for each row execute function public.reject_exact_patient_duplicate();

create or replace function public.register_patient_with_identity_check(
  p_patient_number text,p_first_name text,p_last_name text,p_date_of_birth date,p_gender text,p_phone text,
  p_email text,p_address text,p_blood_group text,p_emergency_contact_name text,p_emergency_contact_phone text,
  p_facility_id uuid,p_national_id_hash text default null,p_existing_patient_id uuid default null,
  p_near_match_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; candidates record; exact_candidate uuid; candidate_ids uuid[]:='{}'; near_candidate boolean:=false; created public.patients%rowtype;
begin
  select * into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor.id is null or not public.has_org_permission('patient.create',p_facility_id,null) then raise exception 'Patient registration permission denied for this facility.'; end if;
  if nullif(btrim(p_first_name),'') is null or nullif(btrim(p_last_name),'') is null or p_date_of_birth is null or nullif(btrim(p_phone),'') is null then
    raise exception 'First name, last name, date of birth, and phone are required.';
  end if;
  for candidates in select * from public.find_patient_duplicate_candidates(p_first_name,p_last_name,p_date_of_birth,p_phone,p_national_id_hash) loop
    if candidates.exact_match then exact_candidate:=(candidates.patient->>'id')::uuid;
    else near_candidate:=true; candidate_ids:=array_append(candidate_ids,(candidates.patient->>'id')::uuid); end if;
  end loop;
  if exact_candidate is not null then
    if p_existing_patient_id=exact_candidate then return jsonb_build_object('status','existing','patient',(select to_jsonb(p) from public.patients p where p.id=exact_candidate)); end if;
    raise exception using errcode='23505',message='An exact patient match exists. Choose “Use existing patient” to open that record.';
  end if;
  if p_existing_patient_id is not null then
    if not exists(select 1 from public.find_patient_duplicate_candidates(p_first_name,p_last_name,p_date_of_birth,p_phone,p_national_id_hash) c where (c.patient->>'id')::uuid=p_existing_patient_id) then
      raise exception 'The selected existing patient is not one of the returned identity candidates.';
    end if;
    return jsonb_build_object('status','existing','patient',(select to_jsonb(p) from public.patients p where p.id=p_existing_patient_id));
  end if;
  if near_candidate and length(btrim(coalesce(p_near_match_reason,'')))<10 then raise exception 'A possible match exists. Choose an existing patient or document at least 10 characters explaining why this is a different person.'; end if;
  insert into public.patients(patient_number,first_name,last_name,date_of_birth,gender,phone,email,address,blood_group,
    emergency_contact_name,emergency_contact_phone,registration_date,home_facility_id,status,allergies,chronic_conditions,national_id_hash)
  values(p_patient_number,btrim(p_first_name),btrim(p_last_name),p_date_of_birth,p_gender,btrim(p_phone),nullif(btrim(p_email),''),p_address,p_blood_group,
    p_emergency_contact_name,p_emergency_contact_phone,current_date,p_facility_id,'active','None','None',nullif(btrim(p_national_id_hash),''))
  returning * into created;
  if near_candidate then
    insert into public.patient_duplicate_reviews(patient_id,candidate_patient_ids,reason,actor_id)
    values(created.id,candidate_ids,btrim(p_near_match_reason),actor.id);
  end if;
  return jsonb_build_object('status','created','patient',to_jsonb(created));
end $$;
revoke all on function public.register_patient_with_identity_check(text,text,text,date,text,text,text,text,text,text,text,uuid,text,uuid,text) from public,anon;
grant execute on function public.register_patient_with_identity_check(text,text,text,date,text,text,text,text,text,text,text,uuid,text,uuid,text) to authenticated;
revoke insert on public.patients from authenticated;

create or replace function public.merge_patient_records(p_source_patient_id uuid,p_survivor_patient_id uuid,p_reason text,p_merge_type text default 'general')
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; source_row public.patients%rowtype; survivor_row public.patients%rowtype;
  merge_id uuid; child record; moved_ids jsonb; row_ids jsonb;
begin
  select * into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor.id is null or actor.role::text not in ('super_admin','records_officer','doctor') then raise exception 'Patient merge access denied.'; end if;
  if p_source_patient_id=p_survivor_patient_id or length(btrim(coalesce(p_reason,'')))<10 or p_merge_type not in ('general','unidentified') then raise exception 'Select two distinct records and document a merge reason of at least 10 characters.'; end if;
  select * into source_row from public.patients where id=p_source_patient_id for update;
  if not found then raise exception 'Source patient not found.'; end if;
  select * into survivor_row from public.patients where id=p_survivor_patient_id for update;
  if not found or survivor_row.identity_status='merged' then raise exception 'The survivor record is unavailable or already merged.'; end if;
  if source_row.national_id_hash is not null and survivor_row.national_id_hash is not null
    and source_row.national_id_hash<>survivor_row.national_id_hash then raise exception 'The records have conflicting national identity hashes and cannot be merged.'; end if;
  if not public.can_read_patient_record(source_row.id) or not public.can_read_patient_record(survivor_row.id)
    or not public.has_patient_facility_access(source_row.id) or not public.has_patient_facility_access(survivor_row.id) then raise exception 'Both records must be in the actor’s authorized patient scope.'; end if;
  if exists(select 1 from public.patient_merge_history h where h.source_patient_id=source_row.id and h.reversed_at is null) then raise exception 'This source record already has an active merge. Reverse it before merging again.'; end if;
  merge_id:=gen_random_uuid(); moved_ids:='{}'::jsonb;
  for child in
    select distinct c.table_schema,c.table_name from information_schema.columns c
    join pg_class t on t.relname=c.table_name join pg_namespace n on n.oid=t.relnamespace and n.nspname=c.table_schema
    join pg_constraint fk on fk.conrelid=t.oid and fk.confrelid='public.patients'::regclass and fk.contype='f'
      and fk.conkey=array[(select attnum from pg_attribute where attrelid=t.oid and attname='patient_id' and not attisdropped)]::smallint[]
    where c.column_name='patient_id' and c.table_schema='public' and c.table_name not in ('patients','patient_merge_history','family_card_members')
      and exists(select 1 from information_schema.columns idc where idc.table_schema=c.table_schema and idc.table_name=c.table_name and idc.column_name='id')
    order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(id)),''[]''::jsonb) from public.%I where patient_id=$1',child.table_name) into row_ids using source_row.id;
    -- Save moved identifiers by relation so reversal touches only records this
    -- transaction actually reassigned, never records already owned by survivor.
    moved_ids:=jsonb_set(moved_ids,array[child.table_name],coalesce(row_ids,'[]'::jsonb),true);
    execute format('update public.%I set patient_id=$1 where patient_id=$2',child.table_name) using survivor_row.id,source_row.id;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(id)),'[]'::jsonb) into row_ids from public.family_cards where primary_contact_patient_id=source_row.id;
  moved_ids:=jsonb_set(moved_ids,array['family_cards_primary_contact'],row_ids,true);
  update public.family_cards set primary_contact_patient_id=survivor_row.id where primary_contact_patient_id=source_row.id;
  select coalesce(jsonb_agg(to_jsonb(member)),'[]'::jsonb) into row_ids from public.family_card_members member where member.patient_id=source_row.id;
  moved_ids:=jsonb_set(moved_ids,array['family_card_members_snapshot'],row_ids,true);
  update public.family_card_members temporary_member set patient_id=survivor_row.id
    where temporary_member.patient_id=source_row.id and not exists(select 1 from public.family_card_members existing_member where existing_member.family_card_id=temporary_member.family_card_id and existing_member.patient_id=survivor_row.id);
  delete from public.family_card_members where patient_id=source_row.id;
  update public.patients set identity_status='merged',merged_into_patient_id=survivor_row.id,national_id_hash=null where id=source_row.id;
  update public.patients set identity_verified_at=coalesce(identity_verified_at,now()),identity_verified_by=actor.id,
    national_id_hash=coalesce(national_id_hash,source_row.national_id_hash) where id=survivor_row.id;
  insert into public.patient_merge_history(id,source_patient_id,survivor_patient_id,reason,merge_type,actor_id,source_identity_snapshot,moved_patient_rows)
  values(merge_id,source_row.id,survivor_row.id,btrim(p_reason),p_merge_type,actor.id,
    jsonb_build_object('identity_status',source_row.identity_status,'merged_into_patient_id',source_row.merged_into_patient_id,'identity_verified_at',source_row.identity_verified_at,'identity_verified_by',source_row.identity_verified_by,'national_id_hash',source_row.national_id_hash,'survivor_national_id_hash',survivor_row.national_id_hash,'survivor_identity_verified_at',survivor_row.identity_verified_at,'survivor_identity_verified_by',survivor_row.identity_verified_by),moved_ids);
  return merge_id;
end $$;
revoke all on function public.merge_patient_records(uuid,uuid,text,text) from public,anon;
grant execute on function public.merge_patient_records(uuid,uuid,text,text) to authenticated;

create or replace function public.merge_unidentified_patient(p_temporary_patient_id uuid,p_permanent_patient_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.patients where id=p_temporary_patient_id and identity_status='unidentified') then raise exception 'The source record is not an unidentified temporary record.'; end if;
  insert into public.encounter_workflow_events(encounter_id,patient_id,event_type,department,notes,actor_id)
  select e.id,e.patient_id,'identity_verification_started','Health Information Management',btrim(p_reason),
    (select id from public.profiles where auth_user_id=auth.uid() limit 1)
  from public.encounters e where e.patient_id=p_temporary_patient_id;
  perform public.merge_patient_records(p_temporary_patient_id,p_permanent_patient_id,p_reason,'unidentified');
  insert into public.encounter_workflow_events(encounter_id,patient_id,event_type,department,notes,actor_id)
  select e.id,e.patient_id,'identity_verified_and_linked','Health Information Management',btrim(p_reason),
    (select id from public.profiles where auth_user_id=auth.uid() limit 1)
  from public.encounters e where e.patient_id=p_permanent_patient_id;
end $$;
revoke all on function public.merge_unidentified_patient(uuid,uuid,text) from public,anon;
grant execute on function public.merge_unidentified_patient(uuid,uuid,text) to authenticated;

create or replace function public.reverse_patient_merge(p_merge_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; h public.patient_merge_history%rowtype; child record; ids uuid[];
begin
  select * into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor.id is null or actor.role::text not in ('super_admin','records_officer') then raise exception 'Patient merge reversal access denied.'; end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Document a reversal reason of at least 10 characters.'; end if;
  select * into h from public.patient_merge_history where id=p_merge_id for update;
  if not found or h.reversed_at is not null or now()>h.reversible_until then raise exception 'This merge is not within its reversible retention window.'; end if;
  if not public.can_read_patient_record(h.source_patient_id) or not public.can_read_patient_record(h.survivor_patient_id) then raise exception 'Both patient records must remain in your authorized scope.'; end if;
  for child in select key from jsonb_each(h.moved_patient_rows) loop
    if child.key in ('family_card_members_snapshot','family_cards_primary_contact') then continue; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(h.moved_patient_rows->child.key);
    if coalesce(array_length(ids,1),0)>0 then
      execute format('update public.%I set patient_id=$1 where id=any($2) and patient_id=$3',child.key)
        using h.source_patient_id,ids,h.survivor_patient_id;
    end if;
  end loop;
  update public.family_cards set primary_contact_patient_id=h.source_patient_id
    where id in (select value::uuid from jsonb_array_elements_text(h.moved_patient_rows->'family_cards_primary_contact'));
  insert into public.family_card_members
  select (jsonb_populate_record(null::public.family_card_members,value)).*
  from jsonb_array_elements(h.moved_patient_rows->'family_card_members_snapshot')
  on conflict(id) do update set patient_id=excluded.patient_id;
  update public.patients set national_id_hash=nullif(h.source_identity_snapshot->>'survivor_national_id_hash',''),
    identity_verified_at=nullif(h.source_identity_snapshot->>'survivor_identity_verified_at','')::timestamptz,
    identity_verified_by=nullif(h.source_identity_snapshot->>'survivor_identity_verified_by','')::uuid
    where id=h.survivor_patient_id;
  update public.patients set identity_status=h.source_identity_snapshot->>'identity_status',
    merged_into_patient_id=nullif(h.source_identity_snapshot->>'merged_into_patient_id','')::uuid,
    identity_verified_at=nullif(h.source_identity_snapshot->>'identity_verified_at','')::timestamptz,
    identity_verified_by=nullif(h.source_identity_snapshot->>'identity_verified_by','')::uuid,
    national_id_hash=nullif(h.source_identity_snapshot->>'national_id_hash','')
  where id=h.source_patient_id;
  update public.patient_merge_history set reversed_at=now(),reversed_by=actor.id,reversal_reason=btrim(p_reason) where id=h.id;
end $$;
revoke all on function public.reverse_patient_merge(uuid,text) from public,anon;
grant execute on function public.reverse_patient_merge(uuid,text) to authenticated;

create or replace function public.list_patient_merge_history()
returns setof public.patient_merge_history language sql stable security definer set search_path=public as $$
  select h.* from public.patient_merge_history h
  where exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.status::text='active' and p.role::text in ('super_admin','records_officer'))
    and public.has_patient_facility_access(h.source_patient_id) and public.has_patient_facility_access(h.survivor_patient_id)
  order by h.created_at desc limit 100;
$$;
revoke all on function public.list_patient_merge_history() from public,anon;
grant execute on function public.list_patient_merge_history() to authenticated;

commit;
