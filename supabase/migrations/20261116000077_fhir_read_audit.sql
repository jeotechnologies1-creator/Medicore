begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create or replace function public.authorize_fhir_read(p_patient_id uuid,p_resource_type text)
returns boolean language plpgsql security definer set search_path=public as $$
declare actor uuid; event_time timestamptz:=clock_timestamp(); event_data jsonb;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or p_resource_type not in ('Patient','Encounter','Observation','AllergyIntolerance','Condition','MedicationRequest','DiagnosticReport')
   or not public.can_read_patient_record(p_patient_id) or not public.has_patient_facility_access(p_patient_id)
   or not exists(select 1 from public.patient_consents c where c.patient_id=p_patient_id and c.consent_type='data_sharing' and c.status='granted' and c.withdrawn_at is null) then
   raise exception 'FHIR read denied by patient access, facility scope, or data-sharing consent';
 end if;
 insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source)
 values(p_patient_id,actor,'read','fhir_r4_'||lower(p_resource_type),'fhir_r4_api');
 event_data:=jsonb_build_object('resourceType','AuditEvent','type',jsonb_build_object('system','http://terminology.hl7.org/CodeSystem/audit-event-type','code','rest'),'subtype',jsonb_build_array(jsonb_build_object('system','http://hl7.org/fhir/restful-interaction','code','read')),'action','R','recorded',event_time,'outcome','0','agent',jsonb_build_array(jsonb_build_object('who',jsonb_build_object('display',actor::text),'requestor',true)),'source',jsonb_build_object('observer',jsonb_build_object('display','fhir-r4-api')),'entity',jsonb_build_array(jsonb_build_object('what',jsonb_build_object('reference','Patient/'||p_patient_id::text),'type',jsonb_build_object('system','http://hl7.org/fhir/resource-types','code',p_resource_type))));
 insert into public.audit_logs(user_id,action,entity_type,entity_id,severity,change_data)
 values(actor,'FHIR_READ','FHIR.'||p_resource_type,p_patient_id::text,'info',jsonb_build_object('fhir_audit_event',event_data,'source','fhir_r4_api'));
 return true;
end $$;
revoke all on function public.authorize_fhir_read(uuid,text) from public,anon;
grant execute on function public.authorize_fhir_read(uuid,text) to authenticated;
commit;
