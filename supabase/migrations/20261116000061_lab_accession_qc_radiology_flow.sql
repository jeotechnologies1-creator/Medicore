begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

alter table public.lab_orders add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table public.lab_orders add column if not exists accession_number text;
alter table public.lab_orders add column if not exists specimen_status text not null default 'awaiting_collection' check(specimen_status in ('awaiting_collection','collected','rejected'));
alter table public.lab_orders add column if not exists specimen_rejection_reason text;
alter table public.lab_orders add column if not exists corrected_result_reason text;

create table public.lab_accession_counters(
 facility_id uuid not null references public.facilities(id) on delete restrict,
 accession_year integer not null,
 last_value bigint not null check(last_value>0),
 primary key(facility_id,accession_year));

create or replace function public.assign_lab_accession() returns trigger
language plpgsql security definer set search_path=public as $$
declare facility uuid; facility_code text; accession_year integer:=extract(year from now())::integer; next_number bigint;
begin
 if tg_op='UPDATE' then
   if old.accession_number is not null then
     if new.accession_number is distinct from old.accession_number then raise exception 'Laboratory accession numbers are immutable.'; end if;
     new.accession_number:=old.accession_number; new.facility_id:=old.facility_id; return new;
   end if;
 end if;
 select coalesce(p.home_facility_id,doctor.facility_id,technician.facility_id,actor.facility_id) into facility from public.patients p
 left join public.profiles doctor on doctor.id=new.doctor_id
 left join public.profiles technician on technician.id=new.technician_id
 left join public.profiles actor on actor.auth_user_id=auth.uid() where p.id=new.patient_id;
 if facility is null then raise exception 'Laboratory accession requires a patient facility.'; end if;
 select coalesce(nullif(regexp_replace(code,'[^A-Za-z0-9]','','g'),''),upper(substr(id::text,1,8))) into facility_code from public.facilities where id=facility;
 insert into public.lab_accession_counters(facility_id,accession_year,last_value) values(facility,accession_year,1)
 on conflict(facility_id,accession_year) do update set last_value=lab_accession_counters.last_value+1 returning last_value into next_number;
 new.facility_id:=facility;
 new.accession_number:=coalesce(facility_code,'LAB')||'-'||accession_year::text||'-'||lpad(next_number::text,greatest(7,length(next_number::text)),'0');
 return new;
end $$;
drop trigger if exists assign_lab_accession on public.lab_orders;
create trigger assign_lab_accession before insert or update of accession_number on public.lab_orders for each row execute function public.assign_lab_accession();
update public.lab_orders o set accession_number=null where accession_number is null and exists(
 select 1 from public.patients p left join public.profiles doctor on doctor.id=o.doctor_id left join public.profiles technician on technician.id=o.technician_id
 where p.id=o.patient_id and coalesce(p.home_facility_id,doctor.facility_id,technician.facility_id) is not null);
create unique index lab_orders_accession_uidx on public.lab_orders(facility_id,accession_number) where accession_number is not null;

create table public.lab_specimen_events(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 lab_order_id uuid not null references public.lab_orders(id) on delete restrict,patient_id uuid not null references public.patients(id) on delete restrict,
 event_type text not null check(event_type in ('collected','rejected')),reason text,recorded_by uuid not null references public.profiles(id) on delete restrict,
 recorded_at timestamptz not null default now(),created_at timestamptz not null default now(),
 check(event_type<>'rejected' or nullif(btrim(reason),'') is not null));
create index lab_specimen_events_order_idx on public.lab_specimen_events(lab_order_id,recorded_at,id);

create table public.lab_qc_rules(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 analyte_code text not null check(length(btrim(analyte_code))>0),code_system text not null,
 acceptance_rule jsonb not null check(jsonb_typeof(acceptance_rule)='object'),version integer not null check(version>0),
 active boolean not null default true,configured_by uuid not null references public.profiles(id) on delete restrict,
 configured_at timestamptz not null default now(),unique(facility_id,code_system,analyte_code,version));
create unique index lab_qc_active_rule_uidx on public.lab_qc_rules(facility_id,code_system,analyte_code) where active;
create table public.lab_qc_runs(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 analyte_code text not null,code_system text not null,observed_value numeric not null,
 acceptance_rule jsonb not null check(jsonb_typeof(acceptance_rule)='object'),passed boolean not null,
 run_sequence bigint generated always as identity unique,
 run_at timestamptz not null default now(),recorded_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now());
create index lab_qc_runs_latest_idx on public.lab_qc_runs(facility_id,code_system,analyte_code,run_sequence desc);

create table public.lab_corrected_result_history(
 id uuid primary key default gen_random_uuid(),lab_order_id uuid not null references public.lab_orders(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict,facility_id uuid not null references public.facilities(id) on delete restrict,
 previous_results jsonb,new_results jsonb not null,reason text not null check(length(btrim(reason))>0),
 corrected_by uuid not null references public.profiles(id) on delete restrict,corrected_at timestamptz not null default now());
create index lab_corrected_result_history_order_idx on public.lab_corrected_result_history(lab_order_id,corrected_at,id);

create or replace function public.configure_lab_qc_rule(p_facility_id uuid,p_analyte_code text,p_code_system text,p_acceptance_rule jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare actor uuid; actor_facility uuid; next_version integer; low_value numeric; high_value numeric;
begin
 select id,facility_id into actor,actor_facility from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_any_role(array['super_admin','laboratory_scientist']) or (actor_facility is distinct from p_facility_id and not public.has_any_role(array['super_admin'])) then raise exception 'Laboratory QC configuration access denied.'; end if;
 if nullif(btrim(p_analyte_code),'') is null or nullif(btrim(p_code_system),'') is null or p_acceptance_rule is null or jsonb_typeof(p_acceptance_rule)<>'object'
   or not (p_acceptance_rule ? 'minimum' and p_acceptance_rule ? 'maximum')
   or coalesce(p_acceptance_rule->>'minimum','') !~ '^-?[0-9]+(\.[0-9]+)?$'
   or coalesce(p_acceptance_rule->>'maximum','') !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'QC acceptance rules require numeric minimum and maximum values.'; end if;
 low_value:=(p_acceptance_rule->>'minimum')::numeric; high_value:=(p_acceptance_rule->>'maximum')::numeric;
 if low_value>high_value then raise exception 'QC acceptance minimum cannot exceed maximum.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_facility_id::text||':'||btrim(p_code_system)||':'||btrim(p_analyte_code),0));
 update public.lab_qc_rules set active=false where facility_id=p_facility_id and analyte_code=btrim(p_analyte_code) and code_system=btrim(p_code_system) and active;
 select coalesce(max(version),0)+1 into next_version from public.lab_qc_rules where facility_id=p_facility_id and analyte_code=btrim(p_analyte_code) and code_system=btrim(p_code_system);
 insert into public.lab_qc_rules(facility_id,analyte_code,code_system,acceptance_rule,version,configured_by)
 values(p_facility_id,btrim(p_analyte_code),btrim(p_code_system),p_acceptance_rule,next_version,actor);
 return next_version;
end $$;

create or replace function public.record_lab_qc_run(p_facility_id uuid,p_analyte_code text,p_code_system text,p_observed_value numeric) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; actor_facility uuid; rule public.lab_qc_rules%rowtype; run_id uuid; is_pass boolean;
begin
 select id,facility_id into actor,actor_facility from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_any_role(array['super_admin','laboratory_scientist']) or (actor_facility is distinct from p_facility_id and not public.has_any_role(array['super_admin'])) then raise exception 'Laboratory QC recording access denied.'; end if;
 select * into rule from public.lab_qc_rules where facility_id=p_facility_id and analyte_code=btrim(p_analyte_code) and code_system=btrim(p_code_system) and active;
 if not found then raise exception 'No active QC acceptance rule is configured for this analyte.'; end if;
 if p_observed_value is null then raise exception 'QC observed value is required.'; end if;
 is_pass:=p_observed_value between (rule.acceptance_rule->>'minimum')::numeric and (rule.acceptance_rule->>'maximum')::numeric;
 insert into public.lab_qc_runs(facility_id,analyte_code,code_system,observed_value,acceptance_rule,passed,recorded_by)
 values(rule.facility_id,rule.analyte_code,rule.code_system,p_observed_value,rule.acceptance_rule,is_pass,actor) returning id into run_id;
 return run_id;
end $$;

create or replace function public.reject_lab_specimen(p_lab_order_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; actor_facility uuid; order_row public.lab_orders%rowtype; event_id uuid;
begin
 select id,facility_id into actor,actor_facility from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into order_row from public.lab_orders where id=p_lab_order_id for update;
 if actor is null or order_row.id is null or not public.has_any_role(array['super_admin','laboratory_scientist']) or (actor_facility is distinct from order_row.facility_id and not public.has_any_role(array['super_admin'])) then raise exception 'Specimen rejection access denied.'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Specimen rejection requires a reason.'; end if;
 if order_row.specimen_status='rejected' then raise exception 'Specimen is already rejected.'; end if;
 perform set_config('app.lab_specimen_rejection_rpc','on',true);
 update public.lab_orders set specimen_status='rejected',specimen_rejection_reason=btrim(p_reason) where id=order_row.id;
 insert into public.lab_specimen_events(facility_id,lab_order_id,patient_id,event_type,reason,recorded_by)
 values(order_row.facility_id,order_row.id,order_row.patient_id,'rejected',btrim(p_reason),actor) returning id into event_id;
 return event_id;
end $$;

create or replace function public.collect_lab_specimen(p_lab_order_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; actor_facility uuid; order_row public.lab_orders%rowtype; event_id uuid;
begin
 select id,facility_id into actor,actor_facility from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into order_row from public.lab_orders where id=p_lab_order_id for update;
 if actor is null or order_row.id is null or not public.has_any_role(array['super_admin','laboratory_scientist']) or (actor_facility is distinct from order_row.facility_id and not public.has_any_role(array['super_admin'])) then raise exception 'Specimen collection access denied.'; end if;
 if order_row.status<>'pending' then raise exception 'Only a pending laboratory order can have its specimen collected.'; end if;
 if order_row.specimen_status='rejected' then raise exception 'Rejected specimens cannot be collected.'; end if;
 if order_row.specimen_status='collected' then raise exception 'Specimen is already collected.'; end if;
 perform set_config('app.lab_specimen_rejection_rpc','on',true);
 update public.lab_orders set status='processing',specimen_status='collected',specimen_collected_at=now() where id=order_row.id;
 insert into public.lab_specimen_events(facility_id,lab_order_id,patient_id,event_type,recorded_by)
 values(order_row.facility_id,order_row.id,order_row.patient_id,'collected',actor) returning id into event_id;
 return event_id;
end $$;

create or replace function public.guard_lab_specimen_rejection() returns trigger language plpgsql as $$
begin
 if new.specimen_status is distinct from old.specimen_status
   and current_setting('app.lab_specimen_rejection_rpc',true) is distinct from 'on' then
   raise exception 'Use the specimen collection or rejection workflow to record an audit event.';
 end if;
 if old.specimen_status='rejected' and new.specimen_status is distinct from old.specimen_status then raise exception 'Rejected specimen status is immutable.'; end if;
 if old.specimen_status='rejected' and new.specimen_rejection_reason is distinct from old.specimen_rejection_reason then raise exception 'Rejected specimen reason is immutable.'; end if;
 if new.specimen_status='rejected' and nullif(btrim(new.specimen_rejection_reason),'') is null then raise exception 'Rejected specimens require a reason.'; end if;
 return new;
end $$;
drop trigger if exists guard_lab_specimen_rejection on public.lab_orders;
create trigger guard_lab_specimen_rejection before update of specimen_status,specimen_rejection_reason on public.lab_orders for each row execute function public.guard_lab_specimen_rejection();

create or replace function public.guard_lab_result_qc_and_correction() returns trigger
language plpgsql security definer set search_path=public as $$
declare value_row jsonb; analyte text; latest_pass boolean; release_check boolean:=false;
begin
 if new.specimen_status='rejected' and new.result_status in ('final','corrected') then raise exception 'Released results cannot be associated with a rejected specimen.'; end if;
 if tg_op='INSERT' then release_check:=true;
 else release_check:=old.result_status is distinct from new.result_status or old.results is distinct from new.results; end if;
 if new.result_status in ('final','corrected') and release_check then
   if new.specimen_status='rejected' then raise exception 'Rejected specimens cannot have released results.'; end if;
   if jsonb_typeof(new.results->'values')<>'array' then raise exception 'Results require analyte-coded values before release.'; end if;
   if jsonb_array_length(new.results->'values')=0 then raise exception 'Results require analyte-coded values before release.'; end if;
   for value_row in select value from jsonb_array_elements(new.results->'values') loop
     analyte:=coalesce(nullif(value_row->>'code',''),new.code);
     if analyte is null or coalesce(nullif(value_row->>'code_system',''),new.code_system) is null then raise exception 'Every released analyte requires a code system and code for QC lookup.'; end if;
     select passed into latest_pass from public.lab_qc_runs where facility_id=new.facility_id and analyte_code=analyte and code_system=coalesce(nullif(value_row->>'code_system',''),new.code_system) order by run_sequence desc limit 1;
     if latest_pass is distinct from true then raise exception 'Result release blocked: latest QC for analyte % is missing or failed.',analyte; end if;
   end loop;
 end if;
 if tg_op='UPDATE' then
   if old.results is distinct from new.results and old.result_status in ('final','corrected')
     and (new.result_status<>'corrected' or nullif(btrim(new.corrected_result_reason),'') is null) then raise exception 'Corrected results require corrected status and a reason.'; end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_lab_result_qc_and_correction on public.lab_orders;
create trigger guard_lab_result_qc_and_correction before insert or update of results,result_status,specimen_status on public.lab_orders for each row execute function public.guard_lab_result_qc_and_correction();

create or replace function public.record_lab_corrected_result() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 if old.results is distinct from new.results and old.result_status in ('final','corrected') then
   select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
   insert into public.lab_corrected_result_history(lab_order_id,patient_id,facility_id,previous_results,new_results,reason,corrected_by)
   values(new.id,new.patient_id,new.facility_id,old.results,new.results,btrim(new.corrected_result_reason),coalesce(actor,new.result_verified_by,new.technician_id,new.doctor_id));
 end if;
 return new;
end $$;
drop trigger if exists record_lab_corrected_result on public.lab_orders;
create trigger record_lab_corrected_result after update of results on public.lab_orders for each row execute function public.record_lab_corrected_result();

create or replace view public.lab_specimen_labels with (security_invoker=true) as
 select id as lab_order_id,patient_id,facility_id,accession_number,test_type,category,ordered_date,specimen_status
 from public.lab_orders where accession_number is not null;
grant select on public.lab_specimen_labels to authenticated,service_role;
alter table public.document_print_audit drop constraint if exists document_print_audit_document_type_check;
alter table public.document_print_audit add constraint document_print_audit_document_type_check check(document_type in ('prescription','discharge_summary','referral_letter','lab_report','specimen_label','radiology_report','invoice','receipt'));
create or replace function public.record_specimen_label_print(p_lab_order_id uuid,p_patient_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; audit_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.can_read_patient_record(p_patient_id) or not public.has_patient_facility_access(p_patient_id)
   or not exists(select 1 from public.lab_orders where id=p_lab_order_id and patient_id=p_patient_id and accession_number is not null) then
   raise exception 'Specimen label print access denied.';
 end if;
 insert into public.document_print_audit(document_type,document_id,patient_id,actor_id)
 values('specimen_label',p_lab_order_id,p_patient_id,actor) returning id into audit_id;
 return audit_id;
end $$;
revoke all on function public.record_specimen_label_print(uuid,uuid) from public,anon;
grant execute on function public.record_specimen_label_print(uuid,uuid) to authenticated;

alter table public.radiology_orders add column if not exists report_state text not null default 'preliminary' check(report_state in ('preliminary','final','addendum'));
update public.radiology_orders set report_state=case report_status when 'final' then 'final' when 'amended' then 'addendum' else 'preliminary' end;
create table public.radiology_report_history(
 id uuid primary key default gen_random_uuid(),radiology_order_id uuid not null references public.radiology_orders(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict,previous_report text,new_report text not null,
 report_state text not null check(report_state in ('preliminary','final','addendum')),critical_finding boolean not null default false,
 authored_by uuid not null references public.profiles(id) on delete restrict,authored_at timestamptz not null default now());
create index radiology_report_history_order_idx on public.radiology_report_history(radiology_order_id,authored_at,id);
create or replace function public.sync_radiology_report_state() returns trigger language plpgsql as $$
begin
 new.report_status:=case new.report_state when 'preliminary' then 'preliminary' when 'final' then 'final' when 'addendum' then 'amended' end;
 if new.report_state in ('final','addendum') and nullif(btrim(new.report),'') is null then raise exception 'Final reports and addenda require report text.'; end if;
 return new;
end $$;
drop trigger if exists sync_radiology_report_state on public.radiology_orders;
drop trigger if exists aa_sync_radiology_report_state on public.radiology_orders;
create trigger aa_sync_radiology_report_state before insert or update of report_state,report on public.radiology_orders for each row execute function public.sync_radiology_report_state();
create or replace function public.record_radiology_report_history() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 if tg_op='INSERT' then
   select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
   insert into public.radiology_report_history(radiology_order_id,patient_id,previous_report,new_report,report_state,critical_finding,authored_by)
   values(new.id,new.patient_id,null,coalesce(new.report,''),new.report_state,new.critical_finding,coalesce(actor,new.radiologist_id,new.doctor_id));
 elsif new.report is distinct from old.report or new.report_state is distinct from old.report_state then
   select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
   insert into public.radiology_report_history(radiology_order_id,patient_id,previous_report,new_report,report_state,critical_finding,authored_by)
   values(new.id,new.patient_id,old.report,coalesce(new.report,''),new.report_state,new.critical_finding,coalesce(actor,new.radiologist_id,new.doctor_id));
 end if;
 return new;
end $$;
drop trigger if exists record_radiology_report_history on public.radiology_orders;
create trigger record_radiology_report_history after insert or update of report,report_state on public.radiology_orders for each row execute function public.record_radiology_report_history();

do $$ declare t text; begin
 foreach t in array array['lab_specimen_events','lab_corrected_result_history','radiology_report_history'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
  execute format('create policy diagnostic_history_read on public.%I for select to authenticated using (public.has_patient_facility_access(patient_id) and public.has_any_role(array[''super_admin'',''doctor'',''specialist'',''laboratory_scientist'',''radiographer'']))',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.prevent_consultation_history_mutation()',t||'_immutable',t);
  execute format('create trigger audit_%I after insert on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop;
end $$;
do $$ declare t text; begin
 foreach t in array array['lab_qc_rules','lab_qc_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
  execute format('create policy lab_qc_read on public.%I for select to authenticated using (public.has_any_role(array[''super_admin'',''laboratory_scientist'']) and (public.has_any_role(array[''super_admin'']) or exists(select 1 from public.profiles pr where pr.auth_user_id=auth.uid() and pr.facility_id=%I.facility_id)))',t,t);
 end loop;
end $$;
create trigger lab_qc_runs_immutable before update or delete on public.lab_qc_runs for each row execute function public.prevent_consultation_history_mutation();
create trigger audit_lab_qc_rules after insert or update on public.lab_qc_rules for each row execute function public.audit_row_change();
create trigger audit_lab_qc_runs after insert on public.lab_qc_runs for each row execute function public.audit_row_change();
alter table public.lab_accession_counters enable row level security;
revoke all on public.lab_accession_counters from public,anon,authenticated;
grant select,insert,update on public.lab_accession_counters to service_role;

revoke all on function public.configure_lab_qc_rule(uuid,text,text,jsonb),public.record_lab_qc_run(uuid,text,text,numeric),public.reject_lab_specimen(uuid,text),public.collect_lab_specimen(uuid) from public,anon;
grant execute on function public.configure_lab_qc_rule(uuid,text,text,jsonb),public.record_lab_qc_run(uuid,text,text,numeric),public.reject_lab_specimen(uuid,text),public.collect_lab_specimen(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
