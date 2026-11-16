begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

alter table public.patients add column if not exists wristband_barcode text;
create unique index if not exists patients_wristband_barcode_uidx on public.patients(wristband_barcode) where wristband_barcode is not null;
alter table public.medication_administrations
 add column if not exists scheduled_dose_id uuid,
 add column if not exists inventory_lot_id uuid references public.pharmacy_inventory(id) on delete restrict,
 add column if not exists scanned_patient_barcode text,
 add column if not exists scanned_medication_barcode text,
 add column if not exists witnessed_by uuid references public.profiles(id) on delete restrict,
 add column if not exists override_reason text;

create table if not exists public.mar_facility_settings(
 facility_id uuid primary key references public.facilities(id) on delete cascade,
 early_window interval not null check(early_window>=interval '0'),
 late_window interval not null check(late_window>=interval '0'),
 updated_at timestamptz not null default now());
create table if not exists public.mar_scheduled_doses(
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
 prescription_id uuid not null references public.prescriptions(id) on delete restrict,
 prescription_item_id uuid not null references public.prescription_items(id) on delete restrict,
 formulary_item_id uuid not null references public.formulary_items(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,
 scheduled_by uuid not null references public.profiles(id) on delete restrict,
 scheduled_at timestamptz not null, dose numeric(12,4) not null check(dose>0), dose_unit text not null, route text not null,
 status text not null default 'scheduled' check(status in ('scheduled','administered','missed','held','refused')),
 recorded_by uuid references public.profiles(id) on delete restrict, recorded_at timestamptz, status_reason text,
 created_at timestamptz not null default now(), check((status='scheduled' and recorded_at is null and recorded_by is null) or (status<>'scheduled' and recorded_at is not null and recorded_by is not null)));
create table if not exists public.mar_witness_credentials(
 profile_id uuid primary key references public.profiles(id) on delete cascade, pin_hash text not null, updated_at timestamptz not null default now());
alter table public.medication_administrations drop constraint if exists medication_administrations_scheduled_dose_fk;
alter table public.medication_administrations add constraint medication_administrations_scheduled_dose_fk foreign key(scheduled_dose_id) references public.mar_scheduled_doses(id) on delete restrict;
create index if not exists mar_scheduled_doses_due_idx on public.mar_scheduled_doses(patient_id,scheduled_at) where status='scheduled';
create unique index if not exists medication_administrations_scheduled_dose_uidx on public.medication_administrations(scheduled_dose_id) where scheduled_dose_id is not null;

create or replace function public.prevent_mar_administration_mutation() returns trigger language plpgsql as $$
begin raise exception 'Medication administration records are immutable.'; end $$;
drop trigger if exists medication_administrations_mar_immutable on public.medication_administrations;
create trigger medication_administrations_mar_immutable before update or delete on public.medication_administrations for each row execute function public.prevent_mar_administration_mutation();

alter table public.mar_facility_settings enable row level security;
alter table public.mar_scheduled_doses enable row level security;
alter table public.mar_witness_credentials enable row level security;
revoke all on public.mar_facility_settings,public.mar_scheduled_doses,public.mar_witness_credentials from public,anon;
grant select on public.mar_facility_settings,public.mar_scheduled_doses to authenticated;
grant all on public.mar_facility_settings to service_role;
grant select,insert on public.mar_scheduled_doses to service_role;
drop policy if exists mar_settings_read on public.mar_facility_settings;
create policy mar_settings_read on public.mar_facility_settings for select to authenticated using(public.has_org_permission('medication.administer',facility_id,null));
drop policy if exists mar_doses_read on public.mar_scheduled_doses;
create policy mar_doses_read on public.mar_scheduled_doses for select to authenticated using(public.has_clinical_department_permission(patient_id,'Ward / Nursing','medication.administer',false));

create or replace function public.configure_mar_time_window(p_facility_id uuid,p_early_minutes integer,p_late_minutes integer) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_early_minutes<0 or p_late_minutes<0 or p_early_minutes>1440 or p_late_minutes>1440 then raise exception 'MAR time window minutes must be between 0 and 1440.'; end if;
 if not public.has_any_role(array['super_admin']) and not public.has_org_permission('organization.manage',p_facility_id,null) then raise exception 'Facility administration access denied.'; end if;
 insert into public.mar_facility_settings(facility_id,early_window,late_window) values(p_facility_id,make_interval(mins=>p_early_minutes),make_interval(mins=>p_late_minutes))
 on conflict(facility_id) do update set early_window=excluded.early_window,late_window=excluded.late_window,updated_at=now();
end $$;
revoke all on function public.configure_mar_time_window(uuid,integer,integer) from public,anon;
grant execute on function public.configure_mar_time_window(uuid,integer,integer) to authenticated;

create or replace function public.set_patient_wristband_barcode(p_patient_id uuid,p_barcode text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_any_role(array['nurse','super_admin']) or not public.has_clinical_department_permission(p_patient_id,'Ward / Nursing','medication.administer',false) then raise exception 'Wristband enrollment access denied.'; end if;
 if nullif(btrim(p_barcode),'') is null then raise exception 'A wristband barcode is required.'; end if;
 update public.patients set wristband_barcode=btrim(p_barcode) where id=p_patient_id;
 if not found then raise exception 'Patient not found.'; end if;
end $$;
revoke all on function public.set_patient_wristband_barcode(uuid,text) from public,anon;
grant execute on function public.set_patient_wristband_barcode(uuid,text) to authenticated;

create or replace function public.prevent_mar_dose_mutation() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and old.status='scheduled' and new.status in ('administered','missed','held','refused')
    and (to_jsonb(new)-array['status','recorded_by','recorded_at','status_reason'])=(to_jsonb(old)-array['status','recorded_by','recorded_at','status_reason'])
    and new.recorded_by is not null and new.recorded_at is not null then return new; end if;
 raise exception 'Scheduled medication dose records are controlled by MAR workflows.';
end $$;
drop trigger if exists mar_scheduled_doses_immutable on public.mar_scheduled_doses;
create trigger mar_scheduled_doses_immutable before update or delete on public.mar_scheduled_doses for each row execute function public.prevent_mar_dose_mutation();

create or replace function public.set_mar_witness_pin(p_pin text) returns void language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','super_admin');
 if actor is null or not public.has_any_role(array['nurse','super_admin']) then raise exception 'Only an active nurse may set a MAR witness PIN.'; end if;
 if p_pin !~ '^[0-9]{6,12}$' then raise exception 'Witness PIN must contain 6 to 12 digits.'; end if;
 insert into public.mar_witness_credentials(profile_id,pin_hash) values(actor,crypt(p_pin,gen_salt('bf'))) on conflict(profile_id) do update set pin_hash=excluded.pin_hash,updated_at=now();
end $$;
revoke all on function public.set_mar_witness_pin(text) from public,anon;
grant execute on function public.set_mar_witness_pin(text) to authenticated;

create or replace function public.schedule_mar_dose(p_prescription_item_id uuid,p_scheduled_at timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare pi public.prescription_items%rowtype; rx public.prescriptions%rowtype; actor uuid; facility uuid; dose_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into pi from public.prescription_items where id=p_prescription_item_id;
 if not found then raise exception 'Prescription item not found.'; end if;
 select * into rx from public.prescriptions where id=pi.prescription_id;
 if rx.status not in ('active','dispensed') then raise exception 'Only an active prescribed dose may be scheduled.'; end if;
 if not public.has_any_role(array['nurse','super_admin']) or not public.has_clinical_department_permission(rx.patient_id,'Ward / Nursing','medication.administer',false) then raise exception 'Medication administration access denied.'; end if;
 select coalesce(home_facility_id,(select facility_id from public.profiles where id=actor)) into facility from public.patients where id=rx.patient_id;
 if facility is null or not exists(select 1 from public.mar_facility_settings where facility_id=facility) then raise exception 'MAR time window is not configured for this facility.'; end if;
 insert into public.mar_scheduled_doses(patient_id,prescription_id,prescription_item_id,formulary_item_id,facility_id,scheduled_by,scheduled_at,dose,dose_unit,route)
 values(rx.patient_id,rx.id,pi.id,pi.formulary_item_id,facility,actor,p_scheduled_at,pi.dose,pi.dose_unit,pi.route) returning id into dose_id;
 return dose_id;
end $$;
revoke all on function public.schedule_mar_dose(uuid,timestamptz) from public,anon;
grant execute on function public.schedule_mar_dose(uuid,timestamptz) to authenticated;

create or replace function public.record_mar_dose(
 p_scheduled_dose_id uuid,p_patient_barcode text,p_medication_barcode text,p_dose numeric,p_dose_unit text,p_route text,
 p_status text default 'administered',p_reason text default null,p_override boolean default false,p_witness_profile_id uuid default null,p_witness_pin text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare dose_row public.mar_scheduled_doses%rowtype; patient_barcode text; actor uuid; witness public.profiles%rowtype; lot public.pharmacy_inventory%rowtype;
 item public.formulary_items%rowtype; settings public.mar_facility_settings%rowtype; allergy_conflict boolean; administration_id uuid; witness_required boolean;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','super_admin');
 if actor is null or not public.has_any_role(array['nurse','super_admin']) then raise exception 'Only an active nurse may record MAR doses.'; end if;
 select * into dose_row from public.mar_scheduled_doses where id=p_scheduled_dose_id for update;
 if not found then raise exception 'Scheduled dose not found.'; end if;
 if dose_row.status<>'scheduled' then raise exception 'Scheduled dose has already been recorded.'; end if;
 if not public.has_clinical_department_permission(dose_row.patient_id,'Ward / Nursing','medication.administer',false) then raise exception 'Medication administration facility access denied.'; end if;
 if p_override is null then p_override:=false; end if;
 if p_status is null or p_status not in ('administered','missed','held','refused') then raise exception 'Invalid MAR dose status.'; end if;
 if p_status<>'administered' then
   if p_override then raise exception 'Overrides can only be recorded for an administration.'; end if;
   if nullif(btrim(p_reason),'') is null then raise exception 'A reason is required for a missed, held, or refused dose.'; end if;
   update public.mar_scheduled_doses set status=p_status,recorded_by=actor,recorded_at=now(),status_reason=btrim(p_reason) where id=dose_row.id;
   return dose_row.id;
 end if;
 select wristband_barcode into patient_barcode from public.patients where id=dose_row.patient_id;
 if patient_barcode is null or btrim(coalesce(p_patient_barcode,'')) is distinct from patient_barcode then raise exception 'Patient wristband barcode does not match the scheduled patient.'; end if;
 if p_dose is distinct from dose_row.dose or lower(btrim(coalesce(p_dose_unit,'')))<>lower(dose_row.dose_unit) then raise exception 'Administered dose does not match the prescribed scheduled dose.'; end if;
 if lower(btrim(coalesce(p_route,'')))<>lower(dose_row.route) then raise exception 'Administration route does not match the prescribed route.'; end if;
 select * into settings from public.mar_facility_settings where facility_id=dose_row.facility_id;
 if not found or now()<dose_row.scheduled_at-settings.early_window or now()>dose_row.scheduled_at+settings.late_window then raise exception 'Dose is outside the configured administration time window.'; end if;
 select * into lot from public.pharmacy_inventory where barcode=btrim(coalesce(p_medication_barcode,'')) for update;
 if not found then raise exception 'Medication/lot barcode was not found.'; end if;
 if lot.formulary_item_id is distinct from dose_row.formulary_item_id then raise exception 'Scanned lot does not match the prescribed formulary item.'; end if;
 if lot.status not in ('active','low_stock') or lot.stock_quantity<=0 then raise exception 'Scanned medication lot is unavailable for administration.'; end if;
 if lot.expiry_date is null or lot.expiry_date<current_date then raise exception 'Scanned medication lot is expired or has no expiry date.'; end if;
 select * into item from public.formulary_items where id=dose_row.formulary_item_id and active;
 if not found then raise exception 'Prescribed formulary item is no longer active.'; end if;
 select exists(select 1 from public.patient_allergies pa join public.formulary_allergen_map m on m.formulary_item_id=item.id and m.approved
   left join public.allergen_classes ac on ac.id=m.allergen_class_id and ac.active
   where pa.patient_id=dose_row.patient_id and pa.category='medication' and pa.clinical_status='active' and pa.verification_status='confirmed'
     and pa.code_system is not null and pa.code is not null and ((m.allergen_code_system=pa.code_system and m.allergen_code=pa.code)
       or (m.allergen_class_id is not null and ac.code_system=pa.code_system and ac.code=pa.code))) into allergy_conflict;
 if allergy_conflict and not p_override then raise exception 'Active confirmed medication allergy conflicts with this formulary item.'; end if;
 if p_override and nullif(btrim(p_reason),'') is null then raise exception 'An override reason is required.'; end if;
 witness_required:=item.controlled or p_override;
 if witness_required then
   if p_witness_profile_id is null or p_witness_pin is null or p_witness_profile_id=actor then raise exception 'A second nurse witness and PIN are required.'; end if;
   select * into witness from public.profiles where id=p_witness_profile_id and status::text='active' and role::text='nurse';
   if not found or witness.facility_id is distinct from dose_row.facility_id then raise exception 'Second witness must be an active nurse assigned to this facility.'; end if;
   if not exists(select 1 from public.mar_witness_credentials c where c.profile_id=witness.id and c.pin_hash=crypt(p_witness_pin,c.pin_hash)) then raise exception 'Second nurse witness PIN is invalid or not configured.'; end if;
 end if;
 insert into public.medication_administrations(patient_id,prescription_id,prescription_item_id,formulary_item_id,scheduled_dose_id,inventory_lot_id,
   medication_name,dosage,administered_by,administered_at,notes,scanned_patient_barcode,scanned_medication_barcode,witnessed_by,override_reason)
 values(dose_row.patient_id,dose_row.prescription_id,dose_row.prescription_item_id,dose_row.formulary_item_id,dose_row.id,lot.id,
   item.generic_name,dose_row.dose::text||' '||dose_row.dose_unit,actor,now(),nullif(btrim(p_reason),''),p_patient_barcode,p_medication_barcode,
   case when witness_required then witness.id else null end,case when p_override then btrim(p_reason) else null end) returning id into administration_id;
 update public.mar_scheduled_doses set status='administered',recorded_by=actor,recorded_at=now() where id=dose_row.id;
 return administration_id;
end $$;
revoke all on function public.record_mar_dose(uuid,text,text,numeric,text,text,text,text,boolean,uuid,text) from public,anon;
grant execute on function public.record_mar_dose(uuid,text,text,numeric,text,text,text,text,boolean,uuid,text) to authenticated;

drop trigger if exists audit_mar_scheduled_doses on public.mar_scheduled_doses;
create trigger audit_mar_scheduled_doses after insert or update on public.mar_scheduled_doses for each row execute function public.audit_row_change();
drop trigger if exists audit_mar_medication_administrations on public.medication_administrations;
create trigger audit_mar_medication_administrations after insert on public.medication_administrations for each row execute function public.audit_row_change();

revoke insert,update,delete on public.medication_administrations from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
