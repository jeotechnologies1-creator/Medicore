begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('coding.read','Review discharged encounters and coding worklists',true),
 ('coding.manage','Assign loaded diagnosis concepts and manage clinician queries',true),
 ('chart.audit.manage','Configure chart audits and track deficiencies',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('records_officer','coding.read','facility'),('records_officer','coding.manage','facility'),
 ('records_officer','chart.audit.manage','facility'),('doctor','coding.read','facility')
on conflict do nothing;

create table public.encounter_diagnosis_codes (
 id uuid primary key default gen_random_uuid(), encounter_id uuid not null references public.encounters(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, facility_id uuid not null references public.facilities(id) on delete restrict,
 code_system text not null, code text not null, display_snapshot text not null,
 code_system_version text, primary_diagnosis boolean not null default false,
 coding_status text not null default 'assigned' check(coding_status in ('assigned','queried','confirmed','amended')),
 assigned_by uuid not null references public.profiles(id), assigned_at timestamptz not null default now(),
 unique(encounter_id,code_system,code),
 foreign key(code_system,code) references public.concepts(system,code) on update cascade on delete restrict
);
create unique index encounter_diagnosis_one_primary on public.encounter_diagnosis_codes(encounter_id) where primary_diagnosis;
create index encounter_diagnosis_patient_idx on public.encounter_diagnosis_codes(facility_id,patient_id,encounter_id);

create table public.coding_clinician_queries (
 id uuid primary key default gen_random_uuid(), encounter_id uuid not null references public.encounters(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, facility_id uuid not null references public.facilities(id) on delete restrict,
 diagnosis_code_id uuid references public.encounter_diagnosis_codes(id) on delete restrict,
 clinician_id uuid not null references public.profiles(id) on delete restrict, question text not null check(length(btrim(question))>0),
 response text, status text not null default 'open' check(status in ('open','responded','closed')),
 asked_by uuid not null references public.profiles(id), asked_at timestamptz not null default now(), responded_at timestamptz,
 responded_by uuid references public.profiles(id), closed_at timestamptz, closed_by uuid references public.profiles(id),
 check((status='open' and response is null and responded_at is null) or (status in ('responded','closed') and response is not null and responded_at is not null))
);
create index coding_queries_clinician_status on public.coding_clinician_queries(clinician_id,status,asked_at desc);

create table public.chart_audit_templates (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 template_name text not null check(length(btrim(template_name))>0), version integer not null check(version>0),
 items jsonb not null check(jsonb_typeof(items)='array'), active boolean not null default true,
 configured_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(facility_id,template_name,version)
);
create unique index chart_audit_template_active_version on public.chart_audit_templates(facility_id,template_name) where active;

create table public.chart_deficiencies (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, encounter_id uuid not null references public.encounters(id) on delete restrict,
 template_id uuid references public.chart_audit_templates(id) on delete restrict, template_version integer,
 department text not null, item_key text, deficiency text not null check(length(btrim(deficiency))>0),
 assigned_clinician_id uuid not null references public.profiles(id) on delete restrict, due_date date not null,
 status text not null default 'open' check(status in ('open','resolved','waived')),
 resolution text, resolved_at timestamptz, resolved_by uuid references public.profiles(id),
 recorded_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check((status='open' and resolved_at is null and resolved_by is null) or (status in ('resolved','waived') and resolved_at is not null and resolved_by is not null))
);
create index chart_deficiencies_dept_status on public.chart_deficiencies(facility_id,department,status,due_date);
create index chart_deficiencies_assignee on public.chart_deficiencies(assigned_clinician_id,status,due_date);

create or replace function public.coding_encounter_context(p_encounter_id uuid)
returns table(patient_id uuid,facility_id uuid,clinician_id uuid,department text)
language sql stable security definer set search_path=public as $$
 select e.patient_id,coalesce(p.home_facility_id,w.facility_id,cl.facility_id),
        coalesce(e.attending_clinician_id,a.doctor_id),coalesce(ap.department,cl.department,'Unspecified')
 from public.encounters e join public.patients p on p.id=e.patient_id
 left join public.admissions a on a.encounter_id=e.id
 left join public.beds b on b.id=a.bed_id left join public.wards w on w.id=b.ward_id
 left join public.profiles cl on cl.id=e.attending_clinician_id
 left join public.appointments ap on ap.id=e.appointment_id
 where e.id=p_encounter_id
$$;

create or replace function public.assign_encounter_diagnosis(p_encounter_id uuid,p_code_system text,p_code text,p_primary boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare ctx record; actor uuid; concept public.concepts%rowtype; version_value text; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into ctx from public.coding_encounter_context(p_encounter_id);
 if actor is null or ctx.patient_id is null or not exists(select 1 from public.admissions a where a.encounter_id=p_encounter_id and a.status='discharged')
   or not public.has_org_permission('coding.manage',ctx.facility_id,null) then raise exception 'Coding assignment requires records coding permission for a discharged encounter.'; end if;
 select * into concept from public.concepts where system=p_code_system and code=p_code and active;
 if concept.code is null then raise exception 'Diagnosis concept is not present and active in the loaded terminology.'; end if;
 select version into version_value from public.code_systems where code=p_code_system;
 insert into public.encounter_diagnosis_codes(encounter_id,patient_id,facility_id,code_system,code,display_snapshot,code_system_version,primary_diagnosis,assigned_by)
 values(p_encounter_id,ctx.patient_id,ctx.facility_id,concept.system,concept.code,concept.display,version_value,p_primary,actor)
 on conflict(encounter_id,code_system,code) do update set display_snapshot=excluded.display_snapshot,code_system_version=excluded.code_system_version,
 primary_diagnosis=excluded.primary_diagnosis,coding_status='amended',assigned_by=excluded.assigned_by,assigned_at=now()
 returning id into result;
 return result;
end $$;

create or replace function public.ask_coding_clinician_query(p_encounter_id uuid,p_diagnosis_code_id uuid,p_question text)
returns uuid language plpgsql security definer set search_path=public as $$
declare ctx record; actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into ctx from public.coding_encounter_context(p_encounter_id);
 if actor is null or ctx.patient_id is null or ctx.clinician_id is null or nullif(btrim(p_question),'') is null
   or not public.has_org_permission('coding.manage',ctx.facility_id,null)
   or (p_diagnosis_code_id is not null and not exists(select 1 from public.encounter_diagnosis_codes where id=p_diagnosis_code_id and encounter_id=p_encounter_id)) then
  raise exception 'Clinician query requires an authorized coder, treating clinician, and valid diagnosis assignment.';
 end if;
 insert into public.coding_clinician_queries(encounter_id,patient_id,facility_id,diagnosis_code_id,clinician_id,question,asked_by)
 values(p_encounter_id,ctx.patient_id,ctx.facility_id,p_diagnosis_code_id,ctx.clinician_id,btrim(p_question),actor) returning id into result;
 if p_diagnosis_code_id is not null then update public.encounter_diagnosis_codes set coding_status='queried' where id=p_diagnosis_code_id; end if;
 return result;
end $$;

create or replace function public.respond_coding_clinician_query(p_query_id uuid,p_response text)
returns void language plpgsql security definer set search_path=public as $$
declare q public.coding_clinician_queries%rowtype; actor uuid;
begin
 select * into q from public.coding_clinician_queries where id=p_query_id for update;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if q.id is null or actor is distinct from q.clinician_id or q.status<>'open' or nullif(btrim(p_response),'') is null then raise exception 'Only the assigned clinician may respond to an open query.'; end if;
 update public.coding_clinician_queries set response=btrim(p_response),status='responded',responded_at=now(),responded_by=actor where id=q.id;
 if q.diagnosis_code_id is not null then update public.encounter_diagnosis_codes set coding_status='confirmed' where id=q.diagnosis_code_id; end if;
end $$;

create or replace function public.configure_chart_audit_template(p_facility_id uuid,p_name text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; next_version integer; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('chart.audit.manage',p_facility_id,null) or nullif(btrim(p_name),'') is null
   or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0
   or exists(select 1 from jsonb_array_elements(p_items) e(item) where jsonb_typeof(e.item)<>'object' or nullif(btrim(e.item->>'key'),'') is null or nullif(btrim(e.item->>'label'),'') is null)
   or (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct e.item->>'key') from jsonb_array_elements(p_items) e(item)) then
  raise exception 'Chart audit template requires unique item keys and labels and facility audit permission.';
 end if;
 select coalesce(max(version),0)+1 into next_version from public.chart_audit_templates where facility_id=p_facility_id and template_name=btrim(p_name);
 update public.chart_audit_templates set active=false where facility_id=p_facility_id and template_name=btrim(p_name) and active;
 insert into public.chart_audit_templates(facility_id,template_name,version,items,configured_by)
 values(p_facility_id,btrim(p_name),next_version,p_items,actor) returning id into result;
 return result;
end $$;

create or replace function public.record_chart_deficiency(p_encounter_id uuid,p_template_id uuid,p_item_key text,p_deficiency text,p_assigned_clinician_id uuid,p_due_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare ctx record; actor uuid; t public.chart_audit_templates%rowtype; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into ctx from public.coding_encounter_context(p_encounter_id);
 if actor is null or ctx.patient_id is null or p_due_date is null or p_due_date<current_date or nullif(btrim(p_deficiency),'') is null
   or not public.has_org_permission('chart.audit.manage',ctx.facility_id,null)
   or not exists(select 1 from public.profiles where id=p_assigned_clinician_id and status::text='active' and role::text in ('doctor','specialist','surgeon')) then
  raise exception 'Deficiency assignment requires audit permission, an active clinician, and a valid due date.';
 end if;
 if p_template_id is not null then
  select * into t from public.chart_audit_templates where id=p_template_id and facility_id=ctx.facility_id and active;
  if t.id is null or not exists(select 1 from jsonb_array_elements(t.items) e(item) where e.item->>'key'=p_item_key) then raise exception 'Active facility template item is required.'; end if;
 end if;
 insert into public.chart_deficiencies(facility_id,patient_id,encounter_id,template_id,template_version,department,item_key,deficiency,assigned_clinician_id,due_date,recorded_by)
 values(ctx.facility_id,ctx.patient_id,p_encounter_id,t.id,t.version,ctx.department,nullif(p_item_key,''),btrim(p_deficiency),p_assigned_clinician_id,p_due_date,actor) returning id into result;
 return result;
end $$;

create or replace function public.resolve_chart_deficiency(p_deficiency_id uuid,p_resolution text)
returns void language plpgsql security definer set search_path=public as $$
declare d public.chart_deficiencies%rowtype; actor uuid;
begin
 select * into d from public.chart_deficiencies where id=p_deficiency_id for update;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if d.id is null or actor is distinct from d.assigned_clinician_id or d.status<>'open' or nullif(btrim(p_resolution),'') is null then
  raise exception 'Only the assigned clinician may resolve this open deficiency.';
 end if;
 update public.chart_deficiencies set status='resolved',resolution=btrim(p_resolution),resolved_at=now(),resolved_by=actor where id=d.id;
end $$;

create view public.discharged_encounter_coding_worklist with (security_barrier=true) as
select a.id admission_id,e.id encounter_id,e.patient_id,coalesce(p.home_facility_id,w.facility_id,cl.facility_id) facility_id,
 coalesce(e.attending_clinician_id,a.doctor_id) clinician_id,coalesce(ap.department,cl.department,'Unspecified') department,
 a.discharge_date,a.discharged_at,
 (select count(*) from public.encounter_diagnosis_codes d where d.encounter_id=e.id) assigned_code_count,
 (select count(*) from public.coding_clinician_queries q where q.encounter_id=e.id and q.status='open') open_query_count,
 case when not exists(select 1 from public.encounter_diagnosis_codes d where d.encounter_id=e.id) then 'uncoded'
      when exists(select 1 from public.coding_clinician_queries q where q.encounter_id=e.id and q.status='open') then 'query_pending' else 'coded' end coding_status
from public.admissions a join public.encounters e on e.id=a.encounter_id join public.patients p on p.id=a.patient_id
left join public.beds b on b.id=a.bed_id left join public.wards w on w.id=b.ward_id left join public.profiles cl on cl.id=coalesce(e.attending_clinician_id,a.doctor_id)
left join public.appointments ap on ap.id=e.appointment_id where a.status='discharged'
and public.has_org_permission('coding.read',coalesce(p.home_facility_id,w.facility_id,cl.facility_id),null);

create view public.coding_completeness_by_department with (security_barrier=true) as
select w.facility_id,w.department,count(*)::bigint discharged_encounters,
 count(*) filter(where w.assigned_code_count>0)::bigint coded_encounters,
 count(*) filter(where w.coding_status='query_pending')::bigint encounters_with_open_queries,
 case when count(*)=0 then 100::numeric else round(100.0*count(*) filter(where w.assigned_code_count>0 and w.open_query_count=0)/count(*),2) end completeness_percent
from public.discharged_encounter_coding_worklist w group by w.facility_id,w.department;

create view public.chart_deficiency_compliance_by_department with (security_barrier=true) as
select d.facility_id,d.department,count(*)::bigint total_deficiencies,
 count(*) filter(where d.status in ('resolved','waived'))::bigint closed_deficiencies,
 count(*) filter(where d.status='open' and d.due_date<current_date)::bigint overdue_deficiencies,
 case when count(*)=0 then 100::numeric else round(100.0*count(*) filter(where d.status in ('resolved','waived'))/count(*),2) end compliance_percent
from public.chart_deficiencies d where public.has_org_permission('chart.audit.manage',d.facility_id,null)
group by d.facility_id,d.department;

do $$ declare t text; begin
 foreach t in array array['encounter_diagnosis_codes','coding_clinician_queries','chart_audit_templates','chart_deficiencies'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
  if t='encounter_diagnosis_codes' then
   execute format('create policy coding_assignments_read on public.%I for select to authenticated using(public.has_org_permission(''coding.read'',facility_id,null))',t);
  elsif t='coding_clinician_queries' then
   execute format('create policy coding_queries_read on public.%I for select to authenticated using(public.has_org_permission(''coding.read'',facility_id,null) or clinician_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text=''active''))',t);
  elsif t='chart_audit_templates' then
   execute format('create policy chart_templates_read on public.%I for select to authenticated using(public.has_org_permission(''chart.audit.manage'',facility_id,null))',t);
  else
   execute format('create policy chart_deficiencies_read on public.%I for select to authenticated using(public.has_org_permission(''chart.audit.manage'',facility_id,null) or assigned_clinician_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text=''active''))',t);
  end if;
  execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop;
end $$;
revoke all on public.discharged_encounter_coding_worklist,public.coding_completeness_by_department,public.chart_deficiency_compliance_by_department from public,anon,authenticated;
grant select on public.discharged_encounter_coding_worklist,public.coding_completeness_by_department,public.chart_deficiency_compliance_by_department to authenticated;
grant select on public.discharged_encounter_coding_worklist,public.coding_completeness_by_department,public.chart_deficiency_compliance_by_department to service_role;

revoke all on function public.coding_encounter_context(uuid),public.assign_encounter_diagnosis(uuid,text,text,boolean),public.ask_coding_clinician_query(uuid,uuid,text),public.respond_coding_clinician_query(uuid,text),public.configure_chart_audit_template(uuid,text,jsonb),public.record_chart_deficiency(uuid,uuid,text,text,uuid,date),public.resolve_chart_deficiency(uuid,text) from public,anon;
grant execute on function public.assign_encounter_diagnosis(uuid,text,text,boolean),public.ask_coding_clinician_query(uuid,uuid,text),public.respond_coding_clinician_query(uuid,text),public.configure_chart_audit_template(uuid,text,jsonb),public.record_chart_deficiency(uuid,uuid,text,text,uuid,date),public.resolve_chart_deficiency(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
