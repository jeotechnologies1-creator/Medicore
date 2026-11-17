begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create or replace function public.authorize_fhir_read_batch(p_patient_ids uuid[],p_resource_type text)
returns uuid[] language plpgsql security definer set search_path=public as $$
declare
 actor uuid;
 patient_id uuid;
 event_time timestamptz;
 event_data jsonb;
 allowed_ids uuid[]:='{}'::uuid[];
 is_allowed boolean;
begin
 select id into actor from public.profiles
  where auth_user_id=auth.uid() and status::text='active' limit 1;
 if actor is null or p_resource_type is null or p_resource_type not in ('Patient','Encounter','Observation','AllergyIntolerance','Condition','MedicationRequest','DiagnosticReport') then
  raise exception 'FHIR read denied by actor or resource type.';
 end if;
 if coalesce(cardinality(p_patient_ids),0)=0 then
  event_time:=clock_timestamp();
  event_data:=jsonb_build_object('resourceType','AuditEvent','type',jsonb_build_object('system','http://terminology.hl7.org/CodeSystem/audit-event-type','code','rest'),
   'subtype',jsonb_build_array(jsonb_build_object('system','http://hl7.org/fhir/restful-interaction','code','search')),'action','R','recorded',event_time,
   'outcome','0','agent',jsonb_build_array(jsonb_build_object('who',jsonb_build_object('display',actor::text),'requestor',true)),
   'source',jsonb_build_object('observer',jsonb_build_object('display','fhir-r4-api')),
   'entity',jsonb_build_array(jsonb_build_object('type',jsonb_build_object('system','http://hl7.org/fhir/resource-types','code',p_resource_type))));
  insert into public.audit_logs(user_id,action,entity_type,entity_id,severity,change_data)
   values(actor,'FHIR_READ','FHIR.'||p_resource_type,null,'info',jsonb_build_object('fhir_audit_event',event_data,'source','fhir_r4_api'));
  return allowed_ids;
 end if;
 for patient_id in select distinct input.patient_id from unnest(p_patient_ids) as input(patient_id) where input.patient_id is not null order by input.patient_id loop
  if not exists(select 1 from public.patients p where p.id=patient_id) then
   is_allowed:=false;
  else
   is_allowed:=public.can_read_patient_record(patient_id)
    and public.has_patient_facility_access(patient_id)
    and exists(select 1 from public.patient_consents c where c.patient_id=patient_id and c.consent_type='data_sharing'
      and c.status='granted' and c.withdrawn_at is null);
  end if;
  event_time:=clock_timestamp();
  event_data:=jsonb_build_object('resourceType','AuditEvent','type',jsonb_build_object('system','http://terminology.hl7.org/CodeSystem/audit-event-type','code','rest'),
   'subtype',jsonb_build_array(jsonb_build_object('system','http://hl7.org/fhir/restful-interaction','code','read')),'action','R','recorded',event_time,
   'outcome',case when is_allowed then '0' else '8' end,
   'agent',jsonb_build_array(jsonb_build_object('who',jsonb_build_object('display',actor::text),'requestor',true)),
   'source',jsonb_build_object('observer',jsonb_build_object('display','fhir-r4-api')),
   'entity',jsonb_build_array(jsonb_build_object('what',jsonb_build_object('reference','Patient/'||patient_id::text),
    'type',jsonb_build_object('system','http://hl7.org/fhir/resource-types','code',p_resource_type))));
  if is_allowed then
   allowed_ids:=array_append(allowed_ids,patient_id);
   insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source)
    values(patient_id,actor,'read','fhir_r4_'||lower(p_resource_type),'fhir_r4_api');
   insert into public.audit_logs(user_id,action,entity_type,entity_id,severity,change_data)
    values(actor,'FHIR_READ','FHIR.'||p_resource_type,patient_id::text,'info',jsonb_build_object('fhir_audit_event',event_data,'source','fhir_r4_api'));
  else
   insert into public.audit_logs(user_id,action,entity_type,entity_id,severity,change_data)
    values(actor,'FHIR_READ_DENIED','FHIR.'||p_resource_type,patient_id::text,'warning',jsonb_build_object('fhir_audit_event',event_data,'source','fhir_r4_api','reason','patient_facility_or_consent_check_failed'));
  end if;
 end loop;
 return allowed_ids;
end $$;

revoke all on function public.authorize_fhir_read_batch(uuid[],text) from public,anon;
grant execute on function public.authorize_fhir_read_batch(uuid[],text) to authenticated;
notify pgrst,'reload schema';
commit;
