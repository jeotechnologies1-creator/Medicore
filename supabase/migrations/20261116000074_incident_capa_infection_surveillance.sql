begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $$ declare s text; n text; begin
 select ns.nspname,t.typname into s,n from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace cn on cn.oid=c.relnamespace join pg_type t on t.oid=a.atttypid join pg_namespace ns on ns.oid=t.typnamespace where cn.nspname='public' and c.relname='profiles' and a.attname='role' and t.typtype='e';
 if n is not null then execute format('alter type %I.%I add value if not exists %L',s,n,'safety_officer'); end if;
end $$;
insert into public.permission_catalog(permission_key,description,sensitive) values
 ('incident.report','Submit confidential safety incidents',true),('incident.safety.read','Investigate and close safety incidents',true),
 ('infection.surveillance.read','Read ward-level infection surveillance trends',true),('infection.surveillance.manage','Record infection-control cases',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('doctor','incident.report','facility'),('nurse','incident.report','facility'),('pharmacist','incident.report','facility'),('laboratory_scientist','incident.report','facility'),('radiographer','incident.report','facility'),('surgeon','incident.report','facility'),('specialist','incident.report','facility'),('records_officer','incident.report','facility'),('theatre_staff','incident.report','facility'),
 ('safety_officer','incident.safety.read','facility'),('safety_officer','infection.surveillance.read','facility'),('safety_officer','infection.surveillance.manage','facility'),
 ('safety_officer','incident.report','facility'),('super_admin','incident.safety.read','global'),('super_admin','infection.surveillance.read','global'),('super_admin','infection.surveillance.manage','global'),('super_admin','incident.report','global')
on conflict do nothing;

create table if not exists public.incident_severity_scales(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 severity_key text not null,display_label text not null,rank_order integer not null check(rank_order>0),active boolean not null default true,
 configured_by uuid not null references public.profiles(id),configured_at timestamptz not null default now(),
 unique(facility_id,severity_key),unique(facility_id,rank_order),check(length(btrim(severity_key))>0 and length(btrim(display_label))>0));

create table if not exists public.safety_incidents(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 severity_id uuid not null references public.incident_severity_scales(id) on delete restrict,
 incident_type text not null check(length(btrim(incident_type))>0),title text not null,description text not null,
 occurred_at timestamptz not null,reported_at timestamptz not null default now(),location text not null,
 patient_id uuid references public.patients(id) on delete restrict,
 status text not null default 'open' check(status in ('open','investigating','actions_pending','closed')),
 closed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(length(btrim(title))>0 and length(btrim(description))>0 and length(btrim(location))>0),
 check((status='closed')=(closed_at is not null)));
create index if not exists safety_incidents_queue on public.safety_incidents(facility_id,status,reported_at desc);
create index if not exists safety_incidents_patient on public.safety_incidents(patient_id,occurred_at desc) where patient_id is not null;

-- Reporter identity is deliberately stored apart from the incident record. The
-- incident RLS policy can show the reporter their report without exposing this
-- identity mapping to administrators or other report readers.
create table if not exists public.safety_incident_reporter_identity(
 incident_id uuid primary key references public.safety_incidents(id) on delete restrict,
 reporter_profile_id uuid not null references public.profiles(id) on delete restrict,recorded_at timestamptz not null default now());
create table if not exists public.safety_incident_investigations(
 id uuid primary key default gen_random_uuid(),incident_id uuid not null unique references public.safety_incidents(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,investigator_id uuid not null references public.profiles(id),
 findings text not null,root_cause text,investigated_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(length(btrim(findings))>0));
create table if not exists public.safety_incident_actions(
 id uuid primary key default gen_random_uuid(),incident_id uuid not null references public.safety_incidents(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,action_type text not null check(action_type in ('corrective','preventive')),
 description text not null,owner_profile_id uuid not null references public.profiles(id),due_date date not null,
 status text not null default 'open' check(status in ('open','in_progress','completed','verified')),
 completed_at timestamptz,completed_by uuid references public.profiles(id),verified_at timestamptz,verified_by uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(length(btrim(description))>0),check((status in ('completed','verified') and completed_at is not null and completed_by is not null) or status not in ('completed','verified')),
 check((status='verified' and verified_at is not null and verified_by is not null) or (status<>'verified' and verified_at is null and verified_by is null)));
create index if not exists safety_incident_actions_due on public.safety_incident_actions(facility_id,status,due_date);
create table if not exists public.safety_incident_closures(
 id uuid primary key default gen_random_uuid(),incident_id uuid not null unique references public.safety_incidents(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,closed_by uuid not null references public.profiles(id),
 closure_summary text not null,signed_at timestamptz not null default now(),check(length(btrim(closure_summary))>0));

create table if not exists public.infection_surveillance_cases(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 ward_id uuid not null references public.wards(id) on delete restrict,patient_id uuid references public.patients(id) on delete restrict,
 case_category text not null check(length(btrim(case_category))>0),classification text not null check(length(btrim(classification))>0),
 onset_date date not null,reported_date date not null default current_date,status text not null default 'active' check(status in ('active','resolved','ruled_out')),
 recorded_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists infection_surveillance_ward_date on public.infection_surveillance_cases(facility_id,ward_id,onset_date,status);

create or replace function public.is_safety_incident_reporter(p_incident_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.safety_incident_reporter_identity i join public.profiles p on p.id=i.reporter_profile_id where i.incident_id=p_incident_id and p.auth_user_id=auth.uid() and p.status::text='active')
$$;

do $$ declare t text; begin foreach t in array array['incident_severity_scales','safety_incidents','safety_incident_reporter_identity','safety_incident_investigations','safety_incident_actions','safety_incident_closures','infection_surveillance_cases'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant select,insert,update on public.%I to service_role',t);
 execute format('drop trigger if exists audit_%I on public.%I',t,t);
 execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop; end $$;
drop policy if exists incident_severity_read on public.incident_severity_scales;
create policy incident_severity_read on public.incident_severity_scales for select to authenticated using(public.has_org_permission('incident.safety.read',facility_id,null));
drop policy if exists safety_incidents_restricted_read on public.safety_incidents;
create policy safety_incidents_restricted_read on public.safety_incidents for select to authenticated using(public.has_org_permission('incident.safety.read',facility_id,null) or public.is_safety_incident_reporter(id));
drop policy if exists incident_identity_safety_only on public.safety_incident_reporter_identity;
create policy incident_identity_safety_only on public.safety_incident_reporter_identity for select to authenticated using(public.has_any_role(array['safety_officer']) and exists(select 1 from public.safety_incidents i where i.id=incident_id and public.has_org_permission('incident.safety.read',i.facility_id,null)));
drop policy if exists incident_investigation_safety_only on public.safety_incident_investigations;
create policy incident_investigation_safety_only on public.safety_incident_investigations for select to authenticated using(public.has_org_permission('incident.safety.read',facility_id,null));
drop policy if exists incident_actions_safety_only on public.safety_incident_actions;
create policy incident_actions_safety_only on public.safety_incident_actions for select to authenticated using(public.has_org_permission('incident.safety.read',facility_id,null));
drop policy if exists incident_closures_safety_only on public.safety_incident_closures;
create policy incident_closures_safety_only on public.safety_incident_closures for select to authenticated using(public.has_org_permission('incident.safety.read',facility_id,null));
drop policy if exists infection_cases_safety_read on public.infection_surveillance_cases;
create policy infection_cases_safety_read on public.infection_surveillance_cases for select to authenticated using(public.has_org_permission('infection.surveillance.read',facility_id,null));

create or replace function public.configure_incident_severity(p_facility_id uuid,p_key text,p_label text,p_rank integer,p_active boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('incident.safety.read',p_facility_id,null) or nullif(btrim(p_key),'') is null or nullif(btrim(p_label),'') is null or p_rank<=0 then raise exception 'Severity configuration requires safety lead permission and a valid key, label, and rank.'; end if;
 insert into public.incident_severity_scales(facility_id,severity_key,display_label,rank_order,active,configured_by) values(p_facility_id,btrim(p_key),btrim(p_label),p_rank,coalesce(p_active,true),actor)
 on conflict(facility_id,severity_key) do update set display_label=excluded.display_label,rank_order=excluded.rank_order,active=excluded.active,configured_by=excluded.configured_by,configured_at=now() returning id into result; return result;
end $$;

create or replace function public.report_safety_incident(p_facility_id uuid,p_severity_key text,p_incident_type text,p_title text,p_description text,p_occurred_at timestamptz,p_location text,p_patient_id uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; severity uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('incident.report',p_facility_id,null) or p_occurred_at is null or nullif(btrim(p_severity_key),'') is null or nullif(btrim(p_incident_type),'') is null or nullif(btrim(p_title),'') is null or nullif(btrim(p_description),'') is null or nullif(btrim(p_location),'') is null then raise exception 'Incident report requires facility reporting permission and complete event details.'; end if;
 select id into severity from public.incident_severity_scales where facility_id=p_facility_id and severity_key=p_severity_key and active;
 if severity is null then raise exception 'Select an active severity configured by the facility safety lead.'; end if;
 if p_patient_id is not null and not exists(select 1 from public.patients where id=p_patient_id and (home_facility_id=p_facility_id or public.has_patient_facility_access(id))) then raise exception 'Incident patient is outside the facility scope.'; end if;
 insert into public.safety_incidents(facility_id,severity_id,incident_type,title,description,occurred_at,location,patient_id) values(p_facility_id,severity,btrim(p_incident_type),btrim(p_title),btrim(p_description),p_occurred_at,btrim(p_location),p_patient_id) returning id into result;
 insert into public.safety_incident_reporter_identity(incident_id,reporter_profile_id) values(result,actor); return result;
end $$;

create or replace function public.investigate_safety_incident(p_incident_id uuid,p_findings text,p_root_cause text default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; inc public.safety_incidents%rowtype; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into inc from public.safety_incidents where id=p_incident_id for update;
 if actor is null or inc.id is null or not public.has_org_permission('incident.safety.read',inc.facility_id,null) or inc.status='closed' or nullif(btrim(p_findings),'') is null then raise exception 'Incident investigation is unavailable or unauthorized.'; end if;
 insert into public.safety_incident_investigations(incident_id,facility_id,investigator_id,findings,root_cause) values(inc.id,inc.facility_id,actor,btrim(p_findings),nullif(btrim(p_root_cause),''))
 on conflict(incident_id) do update set investigator_id=excluded.investigator_id,findings=excluded.findings,root_cause=excluded.root_cause,investigated_at=now(),updated_at=now() returning id into result;
 update public.safety_incidents set status='investigating',updated_at=now() where id=inc.id; return result;
end $$;

create or replace function public.add_safety_incident_action(p_incident_id uuid,p_type text,p_description text,p_owner uuid,p_due_date date) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; inc public.safety_incidents%rowtype; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into inc from public.safety_incidents where id=p_incident_id;
 if actor is null or inc.id is null or not public.has_org_permission('incident.safety.read',inc.facility_id,null) or inc.status='closed' or p_type not in ('corrective','preventive') or nullif(btrim(p_description),'') is null or p_due_date is null or not exists(select 1 from public.profiles where id=p_owner and status::text='active') then raise exception 'Incident action is invalid or unauthorized.'; end if;
 insert into public.safety_incident_actions(incident_id,facility_id,action_type,description,owner_profile_id,due_date,created_by) values(inc.id,inc.facility_id,p_type,btrim(p_description),p_owner,p_due_date,actor) returning id into result;
 update public.safety_incidents set status='actions_pending',updated_at=now() where id=inc.id; return result;
end $$;

create or replace function public.update_safety_incident_action(p_action_id uuid,p_status text) returns void
language plpgsql security definer set search_path=public as $$ declare actor uuid; a public.safety_incident_actions%rowtype; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into a from public.safety_incident_actions where id=p_action_id for update;
 if actor is null or a.id is null or (actor<>a.owner_profile_id and not public.has_org_permission('incident.safety.read',a.facility_id,null)) or p_status not in ('in_progress','completed','verified') then raise exception 'Only the assigned owner may progress an action; verification requires the safety lead.'; end if;
 if p_status='verified' and not public.has_org_permission('incident.safety.read',a.facility_id,null) then raise exception 'Only the safety lead may verify a completed action.'; end if;
 if p_status='completed' and actor<>a.owner_profile_id then raise exception 'Action completion must be recorded by the assigned owner.'; end if;
 if p_status='verified' and a.status<>'completed' then raise exception 'Only completed actions may be verified.'; end if;
 update public.safety_incident_actions set status=p_status,completed_at=case when p_status in ('completed','verified') then coalesce(completed_at,now()) else completed_at end,completed_by=case when p_status in ('completed','verified') then coalesce(completed_by,actor) else completed_by end,
 verified_at=case when p_status='verified' then now() else verified_at end,verified_by=case when p_status='verified' then actor else verified_by end,updated_at=now() where id=a.id;
end $$;

create or replace function public.close_safety_incident(p_incident_id uuid,p_closure_summary text) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; inc public.safety_incidents%rowtype; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into inc from public.safety_incidents where id=p_incident_id for update;
 if actor is null or inc.id is null or not public.has_org_permission('incident.safety.read',inc.facility_id,null) or inc.status='closed' or nullif(btrim(p_closure_summary),'') is null then raise exception 'Incident closure requires safety lead authority and a signed closure summary.'; end if;
 if not exists(select 1 from public.safety_incident_investigations where incident_id=inc.id) or exists(select 1 from public.safety_incident_actions where incident_id=inc.id and status<>'verified') then raise exception 'Complete the investigation and verify every corrective/preventive action before closure.'; end if;
 insert into public.safety_incident_closures(incident_id,facility_id,closed_by,closure_summary) values(inc.id,inc.facility_id,actor,btrim(p_closure_summary)) returning id into result;
 update public.safety_incidents set status='closed',closed_at=now(),updated_at=now() where id=inc.id; return result;
end $$;

create or replace function public.record_infection_surveillance_case(p_facility_id uuid,p_ward_id uuid,p_patient_id uuid,p_category text,p_classification text,p_onset_date date,p_status text default 'active') returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('infection.surveillance.manage',p_facility_id,null) or not exists(select 1 from public.wards where id=p_ward_id and facility_id=p_facility_id) or (p_patient_id is not null and not exists(select 1 from public.patients where id=p_patient_id and (home_facility_id=p_facility_id or public.has_patient_facility_access(id)))) or nullif(btrim(p_category),'') is null or nullif(btrim(p_classification),'') is null or p_onset_date is null or p_status not in ('active','resolved','ruled_out') then raise exception 'Infection case is invalid or facility authorization is missing.'; end if;
 insert into public.infection_surveillance_cases(facility_id,ward_id,patient_id,case_category,classification,onset_date,status,recorded_by) values(p_facility_id,p_ward_id,p_patient_id,btrim(p_category),btrim(p_classification),p_onset_date,p_status,actor) returning id into result; return result;
end $$;

create or replace function public.get_ward_infection_trends(p_facility_id uuid,p_start_date date,p_end_date date) returns jsonb
language plpgsql stable security definer set search_path=public as $$ declare result jsonb; begin
 if p_facility_id is null or p_start_date is null or p_end_date<p_start_date or not public.has_org_permission('infection.surveillance.read',p_facility_id,null) then raise exception 'Infection trends require facility surveillance permission and a valid date range.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('ward_id',x.ward_id,'ward_name',x.ward_name,'case_category',x.case_category,'case_count',x.case_count) order by x.ward_name,x.case_category),'[]'::jsonb) into result
 from (select w.id ward_id,w.name ward_name,c.case_category,count(*)::bigint case_count from public.infection_surveillance_cases c join public.wards w on w.id=c.ward_id where c.facility_id=p_facility_id and c.onset_date between p_start_date and p_end_date and c.status<>'ruled_out' group by w.id,w.name,c.case_category) x;
 return result;
end $$;

revoke all on function public.is_safety_incident_reporter(uuid),public.configure_incident_severity(uuid,text,text,integer,boolean),public.report_safety_incident(uuid,text,text,text,text,timestamptz,text,uuid),public.investigate_safety_incident(uuid,text,text),public.add_safety_incident_action(uuid,text,text,uuid,date),public.update_safety_incident_action(uuid,text),public.close_safety_incident(uuid,text),public.record_infection_surveillance_case(uuid,uuid,uuid,text,text,date,text),public.get_ward_infection_trends(uuid,date,date) from public,anon;
grant execute on function public.is_safety_incident_reporter(uuid),public.configure_incident_severity(uuid,text,text,integer,boolean),public.report_safety_incident(uuid,text,text,text,text,timestamptz,text,uuid),public.investigate_safety_incident(uuid,text,text),public.add_safety_incident_action(uuid,text,text,uuid,date),public.update_safety_incident_action(uuid,text),public.close_safety_incident(uuid,text),public.record_infection_surveillance_case(uuid,uuid,uuid,text,text,date,text),public.get_ward_infection_trends(uuid,date,date) to authenticated;
drop trigger if exists safety_incident_closure_immutable on public.safety_incident_closures;
create trigger safety_incident_closure_immutable before update or delete on public.safety_incident_closures for each row execute function public.prevent_consultation_history_mutation();
notify pgrst,'reload schema';
commit;
