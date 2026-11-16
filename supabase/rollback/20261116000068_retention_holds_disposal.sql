begin;
set local lock_timeout='2s';
set local statement_timeout='45s';
do $$ begin
 if exists(select 1 from public.record_archive_registry) or exists(select 1 from public.disposal_certificates)
  or exists(select 1 from public.retention_schedule where facility_id is not null or version>1 or configured_by is not null or retention_days is null)
  or exists(select 1 from public.legal_holds where facility_id is not null or case_reference is not null or authority_basis is not null)
  or exists(select 1 from public.retention_action_requests where facility_id is not null or schedule_id is not null or first_approved_by is not null or second_approved_by is not null)
 then raise exception 'Rollback refused for 20261116000068: preserve facility retention policy, legal-hold, archive, approval, and disposal certificate history; fix forward.'; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['patients','admissions','encounters','consultations','prescriptions','patient_allergies','patient_conditions','lab_orders','radiology_orders','surgeries','nursing_notes','emergency_visits','intake_output_records','pain_assessments','patient_documents','patient_messages','patient_next_of_kin','medication_orders','medication_administrations','patient_consents','clinical_alerts','care_plans','clinical_tasks','appointments'] loop
  if to_regclass(format('public.%I',t)) is not null then execute format('drop trigger if exists retention_hard_delete_block on public.%I',t); end if;
 end loop;
end $$;
drop function if exists public.prevent_clinical_hard_delete();
drop function if exists public.execute_retention_action(uuid);
drop function if exists public.approve_retention_disposal(uuid,boolean,text);
drop function if exists public.place_legal_hold_case(uuid,uuid,text,text,text,text);
drop function if exists public.configure_retention_schedule(uuid,text,integer,text);
drop trigger if exists disposal_certificates_immutable on public.disposal_certificates;
drop trigger if exists audit_disposal_certificates on public.disposal_certificates;
drop trigger if exists audit_record_archive_registry on public.record_archive_registry;
drop table if exists public.disposal_certificates;
drop table if exists public.record_archive_registry;

create or replace function public.request_retention_action(p_patient_id uuid,p_record_category text,p_record_id text,p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; request_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text='super_admin' limit 1;
 if actor is null then raise exception 'Super Admin approval workflow access is required'; end if;
 if p_action not in ('archive','dispose') or nullif(btrim(p_record_category),'') is null or nullif(btrim(p_record_id),'') is null or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Valid retention action and reason are required'; end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and (h.patient_id=p_patient_id or h.patient_id is null) and (h.record_category is null or h.record_category=p_record_category)) then raise exception 'Active legal hold blocks retention action'; end if;
 insert into public.retention_action_requests(patient_id,record_category,record_id,action,reason,requested_by)
 values(p_patient_id,p_record_category,p_record_id,p_action,btrim(p_reason)) returning id into request_id;
 return request_id;
end $$;
revoke all on function public.request_retention_action(uuid,text,text,text,text) from public,anon;
grant execute on function public.request_retention_action(uuid,text,text,text,text) to authenticated;

create or replace function public.approve_retention_action(p_request_id uuid,p_approve boolean,p_note text)
returns text language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.retention_action_requests%rowtype; configured_officer uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
 begin select (setting_value#>>'{}')::uuid into configured_officer from public.system_settings where setting_key='privacy_officer_profile_id'; exception when others then configured_officer:=null; end;
 if actor is null or (not public.has_any_role(array['super_admin']) and configured_officer is distinct from actor) then raise exception 'Retention approval authority denied'; end if;
 select * into req from public.retention_action_requests where id=p_request_id and status='pending' for update;
 if not found then raise exception 'Retention request is unavailable'; end if;
 if req.requested_by=actor then raise exception 'Retention approval must be performed by a different authorized person'; end if;
 if p_approve and req.action='dispose' and req.record_category in ('encounters','appointments','lab_orders','radiology_orders','prescriptions','vital_signs','consultations','patient_documents','immunizations','medication_administrations','patient_allergies','patient_conditions','medication_orders','care_plans','clinical_tasks','patient_consents','clinical_alerts','encounter_workflow_events','admissions','surgeries','nursing_notes','emergency_visits','intake_output_records','pain_assessments') then raise exception 'Clinical records cannot be physically disposed of; archive or retain them'; end if;
 if p_approve and exists(select 1 from public.legal_holds h where h.status='active' and (h.patient_id=req.patient_id or h.patient_id is null) and (h.record_category is null or h.record_category=req.record_category)) then raise exception 'Active legal hold blocks approval'; end if;
 update public.retention_action_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=actor,decided_at=now(),decision_note=nullif(btrim(p_note),'') where id=req.id;
 return case when p_approve then 'approved_metadata_only' else 'rejected' end;
end $$;
revoke all on function public.approve_retention_action(uuid,boolean,text) from public,anon;
grant execute on function public.approve_retention_action(uuid,boolean,text) to authenticated;

create or replace function public.approve_retention_schedule(p_schedule_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; officer uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
 begin select (setting_value#>>'{}')::uuid into officer from public.system_settings where setting_key='privacy_officer_profile_id'; exception when others then officer:=null; end;
 if actor is null or (not public.has_any_role(array['super_admin']) and officer is distinct from actor) then raise exception 'Retention schedule approval denied'; end if;
 update public.retention_schedule set approved=true,approved_by=actor,approved_at=now() where id=p_schedule_id and not approved;
 if not found then raise exception 'Unapproved retention schedule entry not found'; end if;
end $$;
revoke all on function public.approve_retention_schedule(uuid) from public,anon;
grant execute on function public.approve_retention_schedule(uuid) to authenticated;

drop index if exists public.legal_hold_case_reference_unique;
alter table public.legal_holds drop column if exists authority_basis;
alter table public.legal_holds drop column if exists case_reference;
alter table public.legal_holds drop column if exists facility_id;
alter table public.retention_action_requests drop constraint if exists retention_action_request_second_approver_distinct;
alter table public.retention_action_requests drop constraint if exists retention_action_requests_status_check;
alter table public.retention_action_requests add constraint retention_action_requests_status_check check(status in ('pending','approved','rejected','blocked_by_legal_hold'));
alter table public.retention_action_requests alter column disposition set default 'metadata_only_no_physical_deletion';
alter table public.retention_action_requests drop column if exists second_approved_at;
alter table public.retention_action_requests drop column if exists second_approved_by;
alter table public.retention_action_requests drop column if exists first_approved_at;
alter table public.retention_action_requests drop column if exists first_approved_by;
alter table public.retention_action_requests drop column if exists record_fingerprint;
alter table public.retention_action_requests drop column if exists schedule_version;
alter table public.retention_action_requests drop column if exists schedule_id;
alter table public.retention_action_requests drop column if exists facility_id;
drop index if exists public.retention_schedule_active_scope;
drop index if exists public.retention_schedule_version_scope;
alter table public.retention_schedule drop constraint if exists retention_schedule_days_valid;
alter table public.retention_schedule alter column retention_days set not null;
alter table public.retention_schedule add constraint retention_schedule_retention_days_check check(retention_days>0);
alter table public.retention_schedule add constraint retention_schedule_record_category_key unique(record_category);
alter table public.retention_schedule drop column if exists configured_by;
alter table public.retention_schedule drop column if exists active;
alter table public.retention_schedule drop column if exists version;
alter table public.retention_schedule drop column if exists facility_id;
notify pgrst,'reload schema';
commit;
