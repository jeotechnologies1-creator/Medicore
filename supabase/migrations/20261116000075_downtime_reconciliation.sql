begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('downtime.enter','Enter paper-captured records after service recovery',true),('downtime.reconcile','Review and independently reconcile downtime entries',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('doctor','downtime.enter','facility'),('nurse','downtime.enter','facility'),('pharmacist','downtime.enter','facility'),('laboratory_scientist','downtime.enter','facility'),('radiographer','downtime.enter','facility'),('surgeon','downtime.enter','facility'),('specialist','downtime.enter','facility'),('theatre_staff','downtime.enter','facility'),('records_officer','downtime.enter','facility'),
 ('records_officer','downtime.reconcile','facility'),('safety_officer','downtime.reconcile','facility'),('super_admin','downtime.enter','global'),('super_admin','downtime.reconcile','global')
on conflict do nothing;

create table public.downtime_id_sequences(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 downtime_date date not null,last_sequence bigint not null default 0 check(last_sequence>=0),updated_at timestamptz not null default now(),unique(facility_id,downtime_date));
create table public.downtime_reconciliation_entries(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 downtime_id text not null,patient_id uuid references public.patients(id) on delete restrict,patient_reference text not null,
 form_type text not null,department text not null,paper_author text not null,event_at timestamptz not null,
 paper_form_reference text,entered_by uuid not null references public.profiles(id),entered_at timestamptz not null default now(),
 emr_record_type text,emr_record_id text,entry_note text,
 status text not null default 'entered' check(status in ('entered','checked','discrepancy','reconciled')),
 checked_by uuid references public.profiles(id),checked_at timestamptz,checker_note text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(facility_id,downtime_id),check(length(btrim(patient_reference))>0 and length(btrim(form_type))>0 and length(btrim(department))>0 and length(btrim(paper_author))>0),
 check((status in ('checked','discrepancy','reconciled') and checked_by is not null and checked_at is not null) or (status='entered' and checked_by is null and checked_at is null)),
 check(checked_by is null or checked_by<>entered_by));
create index downtime_reconciliation_queue on public.downtime_reconciliation_entries(facility_id,status,event_at,entered_at);
create index downtime_reconciliation_id_lookup on public.downtime_reconciliation_entries(facility_id,downtime_id);
create table public.downtime_reconciliation_discrepancies(
 id uuid primary key default gen_random_uuid(),entry_id uuid not null references public.downtime_reconciliation_entries(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,reported_by uuid not null references public.profiles(id),
 discrepancy text not null check(length(btrim(discrepancy))>0),status text not null default 'open' check(status in ('open','resolved')),
 resolution text,resolved_by uuid references public.profiles(id),resolved_at timestamptz,created_at timestamptz not null default now(),
 check((status='open' and resolved_by is null and resolved_at is null) or (status='resolved' and resolved_by is not null and resolved_at is not null and resolution is not null)));
create index downtime_discrepancy_queue on public.downtime_reconciliation_discrepancies(facility_id,status,created_at);
create table public.downtime_reconciliation_signatures(
 id uuid primary key default gen_random_uuid(),entry_id uuid not null unique references public.downtime_reconciliation_entries(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,entered_by uuid not null references public.profiles(id),
 checked_by uuid not null references public.profiles(id),checked_at timestamptz not null default now(),checker_statement text not null,
 check(entered_by<>checked_by),check(length(btrim(checker_statement))>0));

do $$ declare t text; begin foreach t in array array['downtime_id_sequences','downtime_reconciliation_entries','downtime_reconciliation_discrepancies','downtime_reconciliation_signatures'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant select,insert,update on public.%I to service_role',t);
 execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop; end $$;
create policy downtime_sequence_read on public.downtime_id_sequences for select to authenticated using(public.has_org_permission('downtime.enter',facility_id,null) or public.has_org_permission('downtime.reconcile',facility_id,null));
create policy downtime_entry_read on public.downtime_reconciliation_entries for select to authenticated using(public.has_org_permission('downtime.enter',facility_id,null) or public.has_org_permission('downtime.reconcile',facility_id,null));
create policy downtime_discrepancy_read on public.downtime_reconciliation_discrepancies for select to authenticated using(public.has_org_permission('downtime.reconcile',facility_id,null));
create policy downtime_signature_read on public.downtime_reconciliation_signatures for select to authenticated using(public.has_org_permission('downtime.reconcile',facility_id,null) or entered_by=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active'));
create trigger downtime_signatures_immutable before update or delete on public.downtime_reconciliation_signatures for each row execute function public.prevent_consultation_history_mutation();

create or replace function public.next_downtime_id(p_facility_id uuid,p_downtime_date date default current_date) returns text
language plpgsql security definer set search_path=public as $$ declare actor uuid; f public.facilities%rowtype; seq bigint; result text; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into f from public.facilities where id=p_facility_id;
 if actor is null or f.id is null or not public.has_org_permission('downtime.enter',p_facility_id,null) or p_downtime_date is null or f.code !~ '^[A-Za-z0-9_-]+$' then raise exception 'Downtime ID allocation requires an authorized facility, date, and safe facility code.'; end if;
 insert into public.downtime_id_sequences(facility_id,downtime_date,last_sequence) values(f.id,p_downtime_date,1)
 on conflict(facility_id,downtime_date) do update set last_sequence=public.downtime_id_sequences.last_sequence+1,updated_at=now() returning last_sequence into seq;
 result:='DT-'||upper(f.code)||'-'||to_char(p_downtime_date,'YYYYMMDD')||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'); return result;
end $$;

create or replace function public.enter_downtime_reconciliation(p_facility_id uuid,p_downtime_id text,p_patient_id uuid,p_patient_reference text,p_form_type text,p_department text,p_paper_author text,p_event_at timestamptz,p_paper_form_reference text default null,p_emr_record_type text default null,p_emr_record_id text default null,p_entry_note text default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; f public.facilities%rowtype; result uuid; prefix text; downtime_date date; sequence_value bigint; date_token text; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into f from public.facilities where id=p_facility_id;
 prefix:='DT-'||upper(f.code)||'-';
 if actor is null or f.id is null or not public.has_org_permission('downtime.enter',p_facility_id,null) or f.code !~ '^[A-Za-z0-9_-]+$' or p_downtime_id is null or left(p_downtime_id,length(prefix))<>prefix or substring(p_downtime_id from length(prefix)+1) !~ '^[0-9]{8}-[0-9]{4,}$'
  or nullif(btrim(p_patient_reference),'') is null or nullif(btrim(p_form_type),'') is null or nullif(btrim(p_department),'') is null or nullif(btrim(p_paper_author),'') is null or p_event_at is null then raise exception 'Reconciliation entry requires a valid facility downtime ID and paper record metadata.'; end if;
 date_token:=substring(p_downtime_id from length(prefix)+1 for 8);
 begin downtime_date:=to_date(date_token,'YYYYMMDD'); sequence_value:=substring(p_downtime_id from length(prefix)+10)::bigint;
 exception when others then raise exception 'Downtime ID contains an invalid date or sequence.'; end;
 if to_char(downtime_date,'YYYYMMDD')<>date_token or sequence_value<1 then raise exception 'Downtime ID contains an invalid date or sequence.'; end if;
 insert into public.downtime_id_sequences(facility_id,downtime_date,last_sequence) values(f.id,downtime_date,sequence_value)
 on conflict(facility_id,downtime_date) do update set last_sequence=greatest(public.downtime_id_sequences.last_sequence,excluded.last_sequence),updated_at=now();
 if p_patient_id is not null and not exists(select 1 from public.patients where id=p_patient_id and (home_facility_id=p_facility_id or public.has_patient_facility_access(id))) then raise exception 'Patient link is outside the facility scope.'; end if;
 insert into public.downtime_reconciliation_entries(facility_id,downtime_id,patient_id,patient_reference,form_type,department,paper_author,event_at,paper_form_reference,entered_by,emr_record_type,emr_record_id,entry_note)
 values(f.id,p_downtime_id,p_patient_id,btrim(p_patient_reference),btrim(p_form_type),btrim(p_department),btrim(p_paper_author),p_event_at,nullif(btrim(p_paper_form_reference),''),actor,nullif(btrim(p_emr_record_type),''),nullif(btrim(p_emr_record_id),''),nullif(btrim(p_entry_note),'')) returning id into result; return result;
end $$;

create or replace function public.check_downtime_reconciliation(p_entry_id uuid,p_matches boolean,p_checker_statement text,p_discrepancy text default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; e public.downtime_reconciliation_entries%rowtype; d uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into e from public.downtime_reconciliation_entries where id=p_entry_id for update;
 if actor is null or e.id is null or not public.has_org_permission('downtime.reconcile',e.facility_id,null) or actor=e.entered_by or e.status<>'entered' or nullif(btrim(p_checker_statement),'') is null or (not p_matches and nullif(btrim(p_discrepancy),'') is null) then raise exception 'Independent reconciliation check requires a distinct checker, statement, and discrepancy when records do not match.'; end if;
 insert into public.downtime_reconciliation_signatures(entry_id,facility_id,entered_by,checked_by,checker_statement) values(e.id,e.facility_id,e.entered_by,actor,btrim(p_checker_statement));
 if p_matches then update public.downtime_reconciliation_entries set status='checked',checked_by=actor,checked_at=now(),checker_note=btrim(p_checker_statement),updated_at=now() where id=e.id;
 else update public.downtime_reconciliation_entries set status='discrepancy',checked_by=actor,checked_at=now(),checker_note=btrim(p_checker_statement),updated_at=now() where id=e.id;
  insert into public.downtime_reconciliation_discrepancies(entry_id,facility_id,reported_by,discrepancy) values(e.id,e.facility_id,actor,btrim(p_discrepancy)) returning id into d;
 end if; return d;
end $$;

create or replace function public.resolve_downtime_discrepancy(p_discrepancy_id uuid,p_resolution text) returns void
language plpgsql security definer set search_path=public as $$ declare actor uuid; d public.downtime_reconciliation_discrepancies%rowtype; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into d from public.downtime_reconciliation_discrepancies where id=p_discrepancy_id and status='open' for update;
 if actor is null or d.id is null or not public.has_org_permission('downtime.reconcile',d.facility_id,null) or nullif(btrim(p_resolution),'') is null or actor=(select entered_by from public.downtime_reconciliation_entries where id=d.entry_id) or actor=(select checked_by from public.downtime_reconciliation_entries where id=d.entry_id) then raise exception 'Discrepancy resolution requires a separate reconciliation reviewer and documented resolution.'; end if;
 update public.downtime_reconciliation_discrepancies set status='resolved',resolution=btrim(p_resolution),resolved_by=actor,resolved_at=now() where id=d.id;
 update public.downtime_reconciliation_entries set status='reconciled',updated_at=now() where id=d.entry_id;
end $$;

revoke all on function public.next_downtime_id(uuid,date),public.enter_downtime_reconciliation(uuid,text,uuid,text,text,text,text,timestamptz,text,text,text,text),public.check_downtime_reconciliation(uuid,boolean,text,text),public.resolve_downtime_discrepancy(uuid,text) from public,anon;
grant execute on function public.next_downtime_id(uuid,date),public.enter_downtime_reconciliation(uuid,text,uuid,text,text,text,text,timestamptz,text,text,text,text),public.check_downtime_reconciliation(uuid,boolean,text,text),public.resolve_downtime_discrepancy(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
