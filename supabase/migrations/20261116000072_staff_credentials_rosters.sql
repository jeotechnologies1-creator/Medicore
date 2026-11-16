begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $$ declare role_type_schema text; role_type_name text; begin
 select tn.nspname,ty.typname into role_type_schema,role_type_name from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace join pg_type ty on ty.oid=a.atttypid join pg_namespace tn on tn.oid=ty.typnamespace where n.nspname='public' and c.relname='profiles' and a.attname='role' and ty.typtype='e';
 if role_type_name is not null then execute format('alter type %I.%I add value if not exists %L',role_type_schema,role_type_name,'hr_officer'); end if;
end $$;

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('staff.credentials.read','Read staff credential records',true),('staff.credentials.manage','Manage credentials and expiry alerts',true),
 ('staff.leave.manage','Review staff leave requests',true),('staff.roster.manage','Manage duty rosters',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('hr_officer','staff.credentials.read','facility'),('hr_officer','staff.credentials.manage','facility'),('hr_officer','staff.leave.manage','facility'),('hr_officer','staff.roster.manage','facility'),
 ('super_admin','staff.credentials.read','global'),('super_admin','staff.credentials.manage','global'),('super_admin','staff.leave.manage','global'),('super_admin','staff.roster.manage','global')
on conflict do nothing;

create table public.staff_credentials(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 profile_id uuid not null references public.profiles(id) on delete restrict,credential_body text not null check(length(btrim(credential_body))>0),
 credential_number text not null check(length(btrim(credential_number))>0),issued_on date not null,expires_on date not null,
 status text not null default 'active' check(status in ('active','revoked','superseded')), notes text,
 recorded_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(expires_on>=issued_on),unique(facility_id,profile_id,credential_body,credential_number));
create index staff_credentials_expiry on public.staff_credentials(facility_id,expires_on) where status='active';
create index staff_credentials_profile on public.staff_credentials(profile_id,facility_id);

create table public.credential_signoff_rules(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 clinical_role text not null,credential_body text not null check(length(btrim(credential_body))>0),blocks_signoff boolean not null default false,
 configured_by uuid not null references public.profiles(id),configured_at timestamptz not null default now(),
 unique(facility_id,clinical_role,credential_body));
create table public.staff_credential_alerts(
 id uuid primary key default gen_random_uuid(),credential_id uuid not null references public.staff_credentials(id) on delete restrict,
 days_ahead integer not null check(days_ahead>=0),recipient_profile_id uuid not null references public.profiles(id),notification_id uuid references public.notifications(id),created_at timestamptz not null default now(),
 unique(credential_id,days_ahead,recipient_profile_id));

create table public.staff_leave_requests(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 profile_id uuid not null references public.profiles(id) on delete restrict,leave_type text not null check(length(btrim(leave_type))>0),
 starts_on date not null,ends_on date not null,reason text not null check(length(btrim(reason))>0),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 requested_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text,
 check(ends_on>=starts_on),check((status in ('approved','rejected') and reviewed_by is not null and reviewed_at is not null) or status not in ('approved','rejected')));
create index staff_leave_facility_dates on public.staff_leave_requests(facility_id,status,starts_on,ends_on);
create table public.duty_rosters(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 department text not null check(length(btrim(department))>0),ward_id uuid references public.wards(id) on delete restrict,
 profile_id uuid not null references public.profiles(id) on delete restrict,starts_at timestamptz not null,ends_at timestamptz not null,
 duty_role text not null check(length(btrim(duty_role))>0),notes text,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(ends_at>starts_at));
create index duty_rosters_facility_time on public.duty_rosters(facility_id,starts_at,ends_at,department);

alter table public.staff_credentials enable row level security;
alter table public.credential_signoff_rules enable row level security;
alter table public.staff_credential_alerts enable row level security;
alter table public.staff_leave_requests enable row level security;
alter table public.duty_rosters enable row level security;
revoke all on public.staff_credentials,public.credential_signoff_rules,public.staff_credential_alerts,public.staff_leave_requests,public.duty_rosters from public,anon,authenticated;
grant select on public.staff_credentials,public.credential_signoff_rules,public.staff_credential_alerts,public.staff_leave_requests,public.duty_rosters to authenticated;
grant select,insert,update on public.staff_credentials,public.credential_signoff_rules,public.staff_credential_alerts,public.staff_leave_requests,public.duty_rosters to service_role;
create policy staff_credentials_hr_read on public.staff_credentials for select to authenticated using(public.has_org_permission('staff.credentials.read',facility_id,null) or profile_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active'));
create policy credential_signoff_hr_read on public.credential_signoff_rules for select to authenticated using(public.has_org_permission('staff.credentials.manage',facility_id,null));
create policy credential_alerts_hr_read on public.staff_credential_alerts for select to authenticated using(recipient_profile_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active') or exists(select 1 from public.staff_credentials c where c.id=credential_id and public.has_org_permission('staff.credentials.manage',c.facility_id,null)));
create policy staff_leave_hr_read on public.staff_leave_requests for select to authenticated using(public.has_org_permission('staff.leave.manage',facility_id,null) or profile_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active'));
create policy duty_rosters_hr_read on public.duty_rosters for select to authenticated using(public.has_org_permission('staff.roster.manage',facility_id,null));
do $$ declare t text; begin foreach t in array array['staff_credentials','credential_signoff_rules','staff_credential_alerts','staff_leave_requests','duty_rosters'] loop execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_row_change()',t,t); end loop; end $$;

create or replace function public.record_staff_credential(p_facility_id uuid,p_profile_id uuid,p_body text,p_number text,p_issued_on date,p_expires_on date,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('staff.credentials.manage',p_facility_id,null) or not exists(select 1 from public.profiles where id=p_profile_id and status::text='active' and (facility_id=p_facility_id or facility_id is null)) or nullif(btrim(p_body),'') is null or nullif(btrim(p_number),'') is null or p_issued_on is null or p_expires_on<p_issued_on then raise exception 'Credential data or HR authorization is invalid.'; end if;
 insert into public.staff_credentials(facility_id,profile_id,credential_body,credential_number,issued_on,expires_on,notes,recorded_by) values(p_facility_id,p_profile_id,btrim(p_body),btrim(p_number),p_issued_on,p_expires_on,nullif(btrim(p_notes),''),actor) returning id into result; return result;
end $$;

create or replace function public.configure_credential_signoff_rule(p_facility_id uuid,p_role text,p_credential_body text,p_blocks boolean) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('staff.credentials.manage',p_facility_id,null) or nullif(btrim(p_role),'') is null or nullif(btrim(p_credential_body),'') is null then raise exception 'Credential rule requires HR permission, role, and credential body.'; end if;
 insert into public.credential_signoff_rules(facility_id,clinical_role,credential_body,blocks_signoff,configured_by) values(p_facility_id,btrim(p_role),btrim(p_credential_body),p_blocks,actor)
 on conflict(facility_id,clinical_role,credential_body) do update set blocks_signoff=excluded.blocks_signoff,configured_by=excluded.configured_by,configured_at=now() returning id into result; return result;
end $$;

create or replace function public.notify_expiring_staff_credentials(p_facility_id uuid,p_days_ahead integer) returns integer
language plpgsql security definer set search_path=public as $$ declare actor uuid; c record; recipient uuid; n integer:=0; notification uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or p_days_ahead<0 or not public.has_org_permission('staff.credentials.manage',p_facility_id,null) then raise exception 'Credential alert dispatch requires HR facility access and a nonnegative alert window.'; end if;
 for c in select * from public.staff_credentials where facility_id=p_facility_id and status='active' and expires_on between current_date and current_date+p_days_ahead loop
  for recipient in select id from public.profiles where status::text='active' and (id=c.profile_id or (role::text='hr_officer' and (facility_id=p_facility_id or facility_id is null)) or role::text='super_admin') loop
   if not exists(select 1 from public.staff_credential_alerts where credential_id=c.id and days_ahead=p_days_ahead and recipient_profile_id=recipient) then
    insert into public.notifications(user_id,type,title,message,priority) values(recipient,'staff_credential_expiry','Staff credential expiring',format('%s credential %s expires on %s.',c.credential_body,c.credential_number,c.expires_on),'high') returning id into notification;
    insert into public.staff_credential_alerts(credential_id,days_ahead,recipient_profile_id,notification_id) values(c.id,p_days_ahead,recipient,notification); n:=n+1;
   end if;
  end loop;
 end loop; return n;
end $$;

create or replace function public.submit_staff_leave_request(p_facility_id uuid,p_leave_type text,p_starts_on date,p_ends_on date,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not exists(select 1 from public.profiles where id=actor and (facility_id=p_facility_id or facility_id is null)) or nullif(btrim(p_leave_type),'') is null or p_starts_on is null or p_ends_on<p_starts_on or nullif(btrim(p_reason),'') is null then raise exception 'Leave request is invalid.'; end if;
 insert into public.staff_leave_requests(facility_id,profile_id,leave_type,starts_on,ends_on,reason) values(p_facility_id,actor,btrim(p_leave_type),p_starts_on,p_ends_on,btrim(p_reason)) returning id into result; return result;
end $$;
create or replace function public.review_staff_leave_request(p_request_id uuid,p_decision text,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$ declare actor uuid; req public.staff_leave_requests%rowtype; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into req from public.staff_leave_requests where id=p_request_id and status='pending' for update;
 if actor is null or req.id is null or actor=req.profile_id or not public.has_org_permission('staff.leave.manage',req.facility_id,null) or p_decision not in ('approved','rejected') then raise exception 'Only an authorized independent HR reviewer can decide a pending leave request.'; end if;
 update public.staff_leave_requests set status=p_decision,reviewed_by=actor,reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=req.id;
end $$;

create or replace function public.create_duty_roster(p_facility_id uuid,p_profile_id uuid,p_department text,p_ward_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_duty_role text,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('staff.roster.manage',p_facility_id,null) or not exists(select 1 from public.profiles where id=p_profile_id and status::text='active' and (facility_id=p_facility_id or facility_id is null)) or nullif(btrim(p_department),'') is null or p_starts_at is null or p_ends_at<=p_starts_at or nullif(btrim(p_duty_role),'') is null or (p_ward_id is not null and not exists(select 1 from public.wards where id=p_ward_id and facility_id=p_facility_id)) then raise exception 'Duty roster entry is invalid or unauthorized.'; end if;
 insert into public.duty_rosters(facility_id,department,ward_id,profile_id,starts_at,ends_at,duty_role,notes,created_by) values(p_facility_id,btrim(p_department),p_ward_id,p_profile_id,p_starts_at,p_ends_at,btrim(p_duty_role),nullif(btrim(p_notes),''),actor) returning id into result; return result;
end $$;

create or replace function public.guard_staff_clinical_signoff() returns trigger language plpgsql security definer set search_path=public as $$ declare person uuid; facility uuid; dept text; begin
 person:=case when tg_table_name='consultation_signatures' then new.author_id else new.signed_by end;
 if tg_table_name='consultation_signatures' then select coalesce(p.home_facility_id,pr.facility_id),pr.department into facility,dept from public.consultations c join public.patients p on p.id=c.patient_id left join public.profiles pr on pr.id=person where c.id=new.consultation_id;
 else select coalesce(p.home_facility_id,w.facility_id,pr.facility_id),pr.department into facility,dept from public.admission_discharge_summaries s join public.patients p on p.id=s.patient_id left join public.admissions a on a.id=s.admission_id left join public.beds b on b.id=a.bed_id left join public.wards w on w.id=b.ward_id left join public.profiles pr on pr.id=person where s.id=new.summary_id; end if;
 if exists(select 1 from public.credential_signoff_rules r where r.facility_id=facility and r.clinical_role=(select role::text from public.profiles where id=person) and r.blocks_signoff and not exists(select 1 from public.staff_credentials c where c.facility_id=facility and c.profile_id=person and c.credential_body=r.credential_body and c.status='active' and c.expires_on>=current_date)) then raise exception 'Clinical sign-off blocked because a required credential is missing or expired.'; end if;
 return new;
end $$;
create trigger consultation_credential_signoff before insert on public.consultation_signatures for each row execute function public.guard_staff_clinical_signoff();
create trigger discharge_credential_signoff before insert on public.admission_discharge_signatures for each row execute function public.guard_staff_clinical_signoff();

revoke all on function public.record_staff_credential(uuid,uuid,text,text,date,date,text),public.configure_credential_signoff_rule(uuid,text,text,boolean),public.notify_expiring_staff_credentials(uuid,integer),public.submit_staff_leave_request(uuid,text,date,date,text),public.review_staff_leave_request(uuid,text,text),public.create_duty_roster(uuid,uuid,text,uuid,timestamptz,timestamptz,text,text),public.guard_staff_clinical_signoff() from public,anon,authenticated;
grant execute on function public.record_staff_credential(uuid,uuid,text,text,date,date,text),public.configure_credential_signoff_rule(uuid,text,text,boolean),public.notify_expiring_staff_credentials(uuid,integer),public.submit_staff_leave_request(uuid,text,date,date,text),public.review_staff_leave_request(uuid,text,text),public.create_duty_roster(uuid,uuid,text,uuid,timestamptz,timestamptz,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
