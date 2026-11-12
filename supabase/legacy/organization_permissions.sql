-- Additive configurable hospital hierarchy and effective-dated staff assignments.
-- Apply after workflow_completion.sql. Department membership does not itself
-- grant access to clinical, HR, or financial data.

create table if not exists public.organization_units (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facilities(id) on delete restrict,
  parent_unit_id uuid references public.organization_units(id) on delete restrict,
  unit_type text not null check (unit_type in ('governance','executive','department','unit','service_line','support')),
  code text not null,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_unit_id is null or parent_unit_id <> id)
);
create unique index if not exists organization_units_scope_code_idx on public.organization_units(coalesce(facility_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(code));
create index if not exists organization_units_parent_idx on public.organization_units(parent_unit_id, sort_order, name);
create index if not exists organization_units_facility_idx on public.organization_units(facility_id, status, unit_type);

create table if not exists public.job_positions (
  id uuid primary key default gen_random_uuid(),
  organization_unit_id uuid not null references public.organization_units(id) on delete restrict,
  reports_to_position_id uuid references public.job_positions(id) on delete set null,
  code text not null,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_unit_id, code)
);
create index if not exists job_positions_reporting_idx on public.job_positions(reports_to_position_id);

create table if not exists public.staff_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  organization_unit_id uuid not null references public.organization_units(id) on delete restrict,
  job_position_id uuid references public.job_positions(id) on delete restrict,
  membership_type text not null default 'staff' check (membership_type in ('staff','lead','acting','observer')),
  is_primary boolean not null default false,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active','ended')),
  justification text,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (status <> 'ended' or ends_on is not null)
);
create unique index if not exists one_active_primary_staff_unit_idx on public.staff_organization_memberships(profile_id)
  where is_primary and status='active' and ends_on is null;
create index if not exists staff_org_memberships_unit_idx on public.staff_organization_memberships(organization_unit_id,status,starts_on,ends_on);
create index if not exists staff_org_memberships_profile_idx on public.staff_organization_memberships(profile_id,status);

create table if not exists public.permission_catalog (
  permission_key text primary key,
  description text not null,
  sensitive boolean not null default false
);
create table if not exists public.role_permission_grants (
  role text not null,
  permission_key text not null references public.permission_catalog(permission_key) on delete cascade,
  scope text not null check (scope in ('global','facility','department')),
  primary key(role,permission_key,scope)
);
create table if not exists public.profile_permission_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.permission_catalog(permission_key) on delete cascade,
  effect text not null check (effect in ('grant','revoke')),
  facility_id uuid references public.facilities(id) on delete cascade,
  organization_unit_id uuid references public.organization_units(id) on delete cascade,
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  justification text not null,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > valid_from),
  check (organization_unit_id is null or facility_id is null)
);
create index if not exists profile_permission_active_idx on public.profile_permission_assignments(profile_id,permission_key,valid_from,expires_at);

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('patient.read','Read patient records',true),('patient.create','Register patients',true),('patient.update','Update demographics',true),('patient.merge','Merge patient identities',true),
 ('encounter.read','Read encounters',true),('encounter.create','Open encounters',true),('encounter.update','Document encounters',true),('encounter.sign','Sign encounters',true),('encounter.amend','Amend signed records',true),
 ('observation.record','Record observations',true),('order.create','Create clinical orders',true),('result.enter','Enter diagnostic results',true),('result.validate','Validate diagnostic results',true),
 ('medication.prescribe','Prescribe medication',true),('medication.dispense','Dispense medication',true),('medication.administer','Record medication administration',true),
 ('admission.request','Request admission',true),('admission.manage','Manage inpatient disposition',true),('bed.assign','Assign inpatient beds',true),
 ('invoice.create','Create invoices',true),('payment.record','Record payments',true),('refund.approve','Approve refunds',true),('inventory.adjust','Adjust inventory',true),
 ('staff.manage','Manage staff assignments',true),('user.manage','Manage user accounts',true),('role.manage','Manage roles and grants',true),('audit.read','Read audit records',true),('report.export','Export reports',true),('organization.manage','Manage organization structure',false)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;

insert into public.role_permission_grants(role,permission_key,scope) values
 ('records_officer','patient.read','facility'),('records_officer','patient.create','facility'),('records_officer','patient.update','facility'),('records_officer','encounter.read','facility'),('records_officer','encounter.create','facility'),
 ('receptionist','patient.read','facility'),('receptionist','patient.create','facility'),('receptionist','patient.update','facility'),('receptionist','encounter.read','facility'),('receptionist','encounter.create','facility'),
 ('doctor','patient.read','department'),('doctor','encounter.read','department'),('doctor','encounter.create','department'),('doctor','encounter.update','department'),('doctor','encounter.sign','department'),('doctor','encounter.amend','department'),('doctor','observation.record','department'),('doctor','order.create','department'),('doctor','result.validate','department'),('doctor','medication.prescribe','department'),('doctor','admission.request','department'),('doctor','admission.manage','department'),
 ('specialist','patient.read','department'),('specialist','encounter.read','department'),('specialist','encounter.create','department'),('specialist','encounter.update','department'),('specialist','encounter.sign','department'),('specialist','observation.record','department'),('specialist','order.create','department'),('specialist','result.validate','department'),('specialist','medication.prescribe','department'),('specialist','admission.request','department'),
 ('surgeon','patient.read','department'),('surgeon','encounter.read','department'),('surgeon','order.create','department'),('surgeon','admission.request','department'),
 ('nurse','patient.read','department'),('nurse','encounter.read','department'),('nurse','observation.record','department'),('nurse','medication.administer','department'),('nurse','bed.assign','department'),('nurse','admission.manage','department'),
 ('laboratory_scientist','patient.read','department'),('laboratory_scientist','result.enter','department'),('laboratory_scientist','result.validate','department'),
 ('radiographer','patient.read','department'),('radiographer','result.enter','department'),('radiographer','result.validate','department'),
 ('pharmacist','patient.read','department'),('pharmacist','medication.dispense','department'),('pharmacist','inventory.adjust','department'),
 ('accountant','invoice.create','facility'),('accountant','payment.record','facility'),('accountant','report.export','facility'),('theatre_staff','patient.read','department')
on conflict do nothing;

alter table public.organization_units enable row level security;
alter table public.job_positions enable row level security;
alter table public.staff_organization_memberships enable row level security;
alter table public.permission_catalog enable row level security;
alter table public.role_permission_grants enable row level security;
alter table public.profile_permission_assignments enable row level security;
revoke all on public.organization_units,public.job_positions,public.staff_organization_memberships,public.permission_catalog,public.role_permission_grants,public.profile_permission_assignments from anon;
grant select,insert,update on public.organization_units,public.job_positions to authenticated;
grant select,insert,update on public.staff_organization_memberships,public.profile_permission_assignments to authenticated;
grant select on public.permission_catalog,public.role_permission_grants to authenticated;
revoke delete on public.organization_units,public.job_positions,public.staff_organization_memberships,public.profile_permission_assignments from authenticated;

drop policy if exists "staff read organization units" on public.organization_units;
create policy "staff read organization units" on public.organization_units for select using (public.is_staff());
drop policy if exists "admins manage organization units" on public.organization_units;
create policy "admins manage organization units" on public.organization_units for all using (public.has_any_role(array['super_admin'])) with check (public.has_any_role(array['super_admin']));
drop policy if exists "staff read job positions" on public.job_positions;
create policy "staff read job positions" on public.job_positions for select using (public.is_staff());
drop policy if exists "admins manage job positions" on public.job_positions;
create policy "admins manage job positions" on public.job_positions for all using (public.has_any_role(array['super_admin'])) with check (public.has_any_role(array['super_admin']));
drop policy if exists "staff read organization memberships" on public.staff_organization_memberships;
create policy "staff read organization memberships" on public.staff_organization_memberships for select using (public.has_any_role(array['super_admin']) or profile_id=(select id from public.profiles where auth_user_id=auth.uid() limit 1));
drop policy if exists "admins manage organization memberships" on public.staff_organization_memberships;
create policy "admins manage organization memberships" on public.staff_organization_memberships for all using (public.has_any_role(array['super_admin'])) with check (public.has_any_role(array['super_admin']));
drop policy if exists "staff read permission catalog" on public.permission_catalog;
create policy "staff read permission catalog" on public.permission_catalog for select using (public.is_staff());
drop policy if exists "staff read role permission grants" on public.role_permission_grants;
create policy "staff read role permission grants" on public.role_permission_grants for select using (public.is_staff());
drop policy if exists "admins manage role permission grants" on public.role_permission_grants;
create policy "admins manage role permission grants" on public.role_permission_grants for all using (public.has_any_role(array['super_admin'])) with check (public.has_any_role(array['super_admin']));
drop policy if exists "staff read own permission assignments" on public.profile_permission_assignments;
create policy "staff read own permission assignments" on public.profile_permission_assignments for select using (public.has_any_role(array['super_admin']) or profile_id=(select id from public.profiles where auth_user_id=auth.uid() limit 1));
drop policy if exists "admins manage permission assignments" on public.profile_permission_assignments;
create policy "admins manage permission assignments" on public.profile_permission_assignments for all using (public.has_any_role(array['super_admin'])) with check (public.has_any_role(array['super_admin']) and assigned_by=(select id from public.profiles where auth_user_id=auth.uid() limit 1));

create or replace function public.guard_organization_unit_tree() returns trigger language plpgsql security definer set search_path=public as $$
declare parent_facility uuid;
begin
  if new.parent_unit_id is null then return new; end if;
  if new.id=new.parent_unit_id then raise exception 'An organization unit cannot parent itself.'; end if;
  if exists(with recursive descendants(id) as (select id from public.organization_units where parent_unit_id=new.id union all select c.id from public.organization_units c join descendants d on c.parent_unit_id=d.id) select 1 from descendants where id=new.parent_unit_id) then raise exception 'The organization hierarchy cannot contain a cycle.'; end if;
  select facility_id into parent_facility from public.organization_units where id=new.parent_unit_id;
  if not found then raise exception 'Parent organization unit does not exist.'; end if;
  if parent_facility is not null and parent_facility is distinct from new.facility_id then raise exception 'Parent and child must share facility scope.'; end if;
  return new;
end;
$$;
drop trigger if exists guard_organization_unit_tree on public.organization_units;
create trigger guard_organization_unit_tree before insert or update on public.organization_units for each row execute function public.guard_organization_unit_tree();

create or replace function public.guard_staff_organization_membership() returns trigger language plpgsql security definer set search_path=public as $$
declare position_unit uuid; actor_profile uuid;
begin
  actor_profile := (select id from public.profiles where auth_user_id=auth.uid() limit 1);
  if tg_op='INSERT' and actor_profile is distinct from new.assigned_by then raise exception 'The approver must be the authenticated profile.'; end if;
  if not exists(select 1 from public.organization_units where id=new.organization_unit_id and status='active') then raise exception 'The organization unit is missing or inactive.'; end if;
  if new.job_position_id is not null then
    select organization_unit_id into position_unit from public.job_positions where id=new.job_position_id and status='active';
    if not found or position_unit<>new.organization_unit_id then raise exception 'The position must belong to the selected unit.'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_staff_organization_membership on public.staff_organization_memberships;
create trigger guard_staff_organization_membership before insert or update on public.staff_organization_memberships for each row execute function public.guard_staff_organization_membership();

create or replace function public.stamp_organization_actor() returns trigger language plpgsql security definer set search_path=public as $$
declare actor_profile uuid;
begin
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() limit 1;
  if tg_op='INSERT' then new.created_by:=actor_profile; end if;
  new.updated_by:=actor_profile; new.updated_at:=now();
  return new;
end;
$$;
drop trigger if exists stamp_organization_unit_actor on public.organization_units;
create trigger stamp_organization_unit_actor before insert or update on public.organization_units for each row execute function public.stamp_organization_actor();
drop trigger if exists stamp_job_position_actor on public.job_positions;
create trigger stamp_job_position_actor before insert or update on public.job_positions for each row execute function public.stamp_organization_actor();

create or replace function public.guard_job_position_reporting() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.reports_to_position_id is null then return new; end if;
  if new.id=new.reports_to_position_id then raise exception 'A position cannot report to itself.'; end if;
  if exists(with recursive reporting_chain(id,reports_to_position_id) as (
    select id,reports_to_position_id from public.job_positions where id=new.reports_to_position_id
    union all select p.id,p.reports_to_position_id from public.job_positions p join reporting_chain r on r.reports_to_position_id=p.id
  ) select 1 from reporting_chain where id=new.id) then raise exception 'Position reporting cannot contain a cycle.'; end if;
  return new;
end;
$$;
drop trigger if exists guard_job_position_reporting on public.job_positions;
create trigger guard_job_position_reporting before insert or update on public.job_positions for each row execute function public.guard_job_position_reporting();

create or replace function public.audit_organization_change() returns trigger language plpgsql security definer set search_path=public as $$
declare actor_profile uuid; entity_id text; operation text;
begin
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() limit 1;
  entity_id := coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id');
  operation := case when tg_op='INSERT' then 'created' when tg_op='UPDATE' then 'updated' else 'deleted' end;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,severity)
  values(actor_profile,'organization.'||operation,tg_table_name,entity_id,'info');
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
do $$ declare target_table text; begin
  foreach target_table in array array['organization_units','job_positions','staff_organization_memberships','profile_permission_assignments','role_permission_grants'] loop
    execute format('drop trigger if exists audit_%I on public.%I',target_table,target_table);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_organization_change()',target_table,target_table);
  end loop;
end $$;

create or replace function public.has_org_permission(requested_permission text,target_facility_id uuid default null,target_unit_id uuid default null) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare actor_id uuid; actor_role text; override_effect text; membership_ok boolean;
begin
  select id,role::text into actor_id,actor_role from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null then return false; end if;
  select effect into override_effect from public.profile_permission_assignments pa where pa.profile_id=actor_id and pa.permission_key=requested_permission
    and pa.valid_from<=now() and (pa.expires_at is null or pa.expires_at>now())
    and ((target_unit_id is not null and pa.organization_unit_id=target_unit_id) or (target_facility_id is not null and pa.facility_id=target_facility_id) or (pa.organization_unit_id is null and pa.facility_id is null))
    order by case when effect='revoke' then 0 else 1 end,created_at desc limit 1;
  if override_effect is not null then return override_effect='grant'; end if;
  if actor_role='super_admin' then return true; end if;
  if not exists(select 1 from public.role_permission_grants where role=actor_role and permission_key in (requested_permission,'*')) then return false; end if;
  if exists(select 1 from public.role_permission_grants where role=actor_role and permission_key in (requested_permission,'*') and scope='global') then return true; end if;
  if target_facility_id is not null and not exists(select 1 from public.staff_organization_memberships m join public.organization_units u on u.id=m.organization_unit_id where m.profile_id=actor_id and m.status='active' and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date) and (u.facility_id=target_facility_id or u.facility_id is null)) then return false; end if;
  if target_unit_id is not null then
    with recursive ancestors(id,parent_unit_id) as (select id,parent_unit_id from public.organization_units where id=target_unit_id union all select p.id,p.parent_unit_id from public.organization_units p join ancestors a on a.parent_unit_id=p.id)
    select exists(select 1 from public.staff_organization_memberships m join ancestors a on a.id=m.organization_unit_id where m.profile_id=actor_id and m.status='active' and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)) into membership_ok;
    if not coalesce(membership_ok,false) then return false; end if;
  elsif target_facility_id is null then return false;
  end if;
  return true;
end;
$$;
revoke all on function public.has_org_permission(text,uuid,uuid) from public,anon;
grant execute on function public.has_org_permission(text,uuid,uuid) to authenticated;

notify pgrst,'reload schema';
