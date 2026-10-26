-- Department-scoped clinical access. Apply after organization_permissions.sql.
-- Restrictive policies intersect with existing role policies, so a role-only
-- policy cannot grant clinical access outside an active organization membership.

insert into public.permission_catalog(permission_key,description,sensitive) values
  ('document.manage','Create and update clinical documents',true),
  ('careplan.manage','Manage clinical care plans',true),('task.manage','Manage clinical tasks',true),
  ('consent.manage','Manage patient consents',true),('clinical_alert.manage','Manage clinical alerts',true),
  ('allergy.manage','Manage patient allergies',true),('condition.manage','Manage patient conditions',true),
  ('clinical.workflow','Manage clinical workflow events',true),('result.acknowledge','Acknowledge clinical results',true),
  ('medication.reconcile','Reconcile medication lists',true),('surgery.manage','Manage theatre and surgical workflow',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;

insert into public.role_permission_grants(role,permission_key,scope)
select role,permission_key,'department' from (values
  ('doctor','document.manage'),('nurse','document.manage'),('doctor','careplan.manage'),('nurse','careplan.manage'),
  ('doctor','task.manage'),('nurse','task.manage'),('doctor','consent.manage'),('nurse','consent.manage'),
  ('doctor','clinical_alert.manage'),('nurse','clinical_alert.manage'),('doctor','allergy.manage'),('nurse','allergy.manage'),
  ('doctor','condition.manage'),('nurse','condition.manage'),('doctor','clinical.workflow'),('nurse','clinical.workflow'),
  ('doctor','result.acknowledge'),('nurse','result.acknowledge'),('specialist','result.acknowledge'),
  ('doctor','medication.reconcile'),('nurse','medication.reconcile'),('doctor','surgery.manage'),('nurse','surgery.manage'),
  ('surgeon','surgery.manage'),('theatre_staff','surgery.manage'),
  ('specialist','clinical.workflow'),('laboratory_scientist','clinical.workflow'),('radiographer','clinical.workflow'),
  ('surgeon','clinical.workflow'),('theatre_staff','clinical.workflow')
) grants(role,permission_key) on conflict do nothing;
insert into public.role_permission_grants(role,permission_key,scope) values
  ('records_officer','clinical.workflow','facility'),('receptionist','clinical.workflow','facility')
on conflict do nothing;

create or replace function public.clinical_row_patient_id(resource_name text,row_data jsonb)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare result_patient_id uuid;
begin
  result_patient_id:=nullif(row_data->>'patient_id','')::uuid;
  if result_patient_id is not null then return result_patient_id; end if;
  if resource_name='care_plan_goals' then
    select patient_id into result_patient_id from public.care_plans where id=nullif(row_data->>'care_plan_id','')::uuid;
  elsif resource_name='encounter_workflow_events' then
    select e.patient_id into result_patient_id from public.encounters e where e.id=nullif(row_data->>'encounter_id','')::uuid;
  elsif resource_name='result_acknowledgements' then
    select lo.patient_id into result_patient_id from public.lab_orders lo where lo.id=nullif(row_data->>'lab_order_id','')::uuid;
  end if;
  return result_patient_id;
end;
$$;

create or replace function public.has_clinical_department_permission(
  target_patient_id uuid,target_department text,requested_permission text,allow_patient_self boolean default false
) returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor_id uuid; actor_role text; target_facility uuid; department_key text;
begin
  select id,role::text,facility_id into actor_id,actor_role,target_facility
  from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null then return false; end if;
  if actor_role='super_admin' then return true; end if;
  if allow_patient_self and exists(select 1 from public.profiles where id=actor_id and patient_id=target_patient_id) then return true; end if;
  select coalesce(p.home_facility_id,target_facility) into target_facility from public.patients p where p.id=target_patient_id;
  if target_facility is null then return false; end if;
  department_key:=nullif(lower(trim(target_department)),'');
  if department_key is not null and not exists(select 1 from public.organization_units mapped_unit
    where mapped_unit.status='active' and (mapped_unit.facility_id=target_facility or mapped_unit.facility_id is null)
      and (lower(mapped_unit.code)=department_key or lower(mapped_unit.name)=department_key)) then
    department_key:=null;
  end if;
  return exists(
    select 1 from public.staff_organization_memberships m
    join public.organization_units u on u.id=m.organization_unit_id and u.status='active'
    where m.profile_id=actor_id and m.status='active' and m.starts_on<=current_date
      and (m.ends_on is null or m.ends_on>=current_date)
      and (u.facility_id=target_facility or u.facility_id is null)
      and (department_key is not null or m.is_primary or (
        select count(*)=1 from public.staff_organization_memberships only_membership
        join public.organization_units only_unit on only_unit.id=only_membership.organization_unit_id and only_unit.status='active'
        where only_membership.profile_id=actor_id and only_membership.status='active'
          and only_membership.starts_on<=current_date and (only_membership.ends_on is null or only_membership.ends_on>=current_date)
          and (only_unit.facility_id=target_facility or only_unit.facility_id is null)
      ))
      and (department_key is null or lower(u.code)=department_key or lower(u.name)=department_key or exists(
        with recursive child_units(id,code,name) as (
          select child.id,child.code,child.name from public.organization_units child where child.parent_unit_id=u.id and child.status='active'
          union all
          select child.id,child.code,child.name from public.organization_units child join child_units parent on child.parent_unit_id=parent.id where child.status='active'
        ) select 1 from child_units where lower(code)=department_key or lower(name)=department_key
      ))
      and public.has_org_permission('patient.read',target_facility,u.id)
      and (requested_permission='patient.read' or exists(
        select 1 from unnest(string_to_array(requested_permission,'|')) as permissions(permission_name)
        where public.has_org_permission(permissions.permission_name,target_facility,u.id)
      ))
  );
end;
$$;
revoke all on function public.clinical_row_patient_id(text,jsonb) from public,anon;
revoke all on function public.has_clinical_department_permission(uuid,text,text,boolean) from public,anon;
grant execute on function public.clinical_row_patient_id(text,jsonb) to authenticated;
grant execute on function public.has_clinical_department_permission(uuid,text,text,boolean) to authenticated;

-- Each resource keeps its existing role policy and adds department permission as a required intersection.
do $$
declare resource record; row_patient text;
begin
  for resource in select * from (values
    ('encounters','encounter.create|encounter.update'),('lab_orders','result.enter|order.create'),('radiology_orders','result.enter|order.create'),
    ('prescriptions','medication.prescribe'),('vital_signs','observation.record'),('consultations','encounter.update'),
    ('patient_documents','document.manage'),('immunizations','observation.record'),
    ('medication_administrations','medication.administer'),('patient_allergies','allergy.manage'),
    ('patient_conditions','condition.manage'),('medication_orders','medication.prescribe'),
    ('care_plans','careplan.manage'),('care_plan_goals','careplan.manage'),('clinical_tasks','task.manage'),
    ('patient_consents','consent.manage'),('clinical_alerts','clinical_alert.manage'),
    ('encounter_workflow_events','clinical.workflow'),('result_acknowledgements','result.acknowledge'),
    ('medication_reconciliations','medication.reconcile'),('admissions','admission.manage'),('surgeries','surgery.manage')
  ) as resources(table_name,write_permission)
  loop
    if to_regclass(format('public.%I',resource.table_name)) is null then continue; end if;
    execute format('alter table public.%I enable row level security',resource.table_name);
    execute format('drop policy if exists %I on public.%I','department clinical read',resource.table_name);
    execute format('drop policy if exists %I on public.%I','department clinical insert',resource.table_name);
    execute format('drop policy if exists %I on public.%I','department clinical update',resource.table_name);
    execute format('drop policy if exists %I on public.%I','department clinical delete',resource.table_name);
    row_patient:=format('public.clinical_row_patient_id(%L,to_jsonb(%I))',resource.table_name,resource.table_name);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.has_clinical_department_permission(%s,nullif(to_jsonb(%I)->>''department'',''''),''patient.read'',true))',
      'department clinical read',resource.table_name,row_patient,resource.table_name);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.has_clinical_department_permission(%s,nullif(to_jsonb(%I)->>''department'',''''),%L,false))',
      'department clinical insert',resource.table_name,row_patient,resource.table_name,resource.write_permission);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.has_clinical_department_permission(%s,nullif(to_jsonb(%I)->>''department'',''''),%L,false)) with check (public.has_clinical_department_permission(%s,nullif(to_jsonb(%I)->>''department'',''''),%L,false))',
      'department clinical update',resource.table_name,row_patient,resource.table_name,resource.write_permission,row_patient,resource.table_name,resource.write_permission);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.has_clinical_department_permission(%s,nullif(to_jsonb(%I)->>''department'',''''),%L,false))',
      'department clinical delete',resource.table_name,row_patient,resource.table_name,resource.write_permission);
  end loop;
end;
$$;

notify pgrst,'reload schema';
