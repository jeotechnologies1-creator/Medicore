-- Patient portal chat, HIM-scoped access, and patient-owned provider checkout.
-- Apply after external_finance_integrations.sql.

insert into public.permission_catalog(permission_key,description,sensitive) values
  ('portal.message.read','Read patient portal conversations',true),
  ('portal.message.reply','Reply to patient portal conversations',true),
  ('portal.appointment.manage','Manage patient appointment requests',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;

insert into public.role_permission_grants(role,permission_key,scope) values
  ('records_officer','portal.message.read','facility'),
  ('records_officer','portal.message.reply','facility'),
  ('records_officer','portal.appointment.manage','facility')
on conflict do nothing;

create or replace function public.set_role_permission_grant(p_role text,p_permission_key text,p_scope text,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_any_role(array['super_admin']) then raise exception 'Only a super administrator may manage role permissions'; end if;
  if p_role not in ('records_officer','receptionist','doctor','nurse','accountant','pharmacist','laboratory_scientist','radiographer','surgeon','specialist','theatre_staff','patient')
    or p_scope not in ('global','facility','department')
    or not exists(select 1 from public.permission_catalog where permission_key=p_permission_key) then
    raise exception 'Invalid role permission grant';
  end if;
  if p_enabled then
    insert into public.role_permission_grants(role,permission_key,scope) values(p_role,p_permission_key,p_scope) on conflict do nothing;
  else
    delete from public.role_permission_grants where role=p_role and permission_key=p_permission_key and scope=p_scope;
  end if;
end $$;
revoke all on function public.set_role_permission_grant(text,text,text,boolean) from public,anon;
grant execute on function public.set_role_permission_grant(text,text,text,boolean) to authenticated;

-- Keep existing clinical and patient policies and add HIM access as a separate
-- policy. PostgreSQL combines permissive policies with OR semantics.
drop policy if exists "HIM read patient portal messages" on public.patient_messages;
create policy "HIM read patient portal messages" on public.patient_messages for select to authenticated using (
  exists(select 1 from public.patients patient where patient.id=patient_messages.patient_id
    and patient.home_facility_id is not null
    and public.has_org_permission('portal.message.read',patient.home_facility_id,null))
);
drop policy if exists "HIM reply to patient portal messages" on public.patient_messages;
create policy "HIM reply to patient portal messages" on public.patient_messages for insert to authenticated with check (
  direction='incoming'
  and sender_profile_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1)
  and exists(select 1 from public.patients patient where patient.id=patient_messages.patient_id
    and patient.home_facility_id is not null
    and public.has_org_permission('portal.message.reply',patient.home_facility_id,null))
);

-- Make the configurable HIM grants govern the registry and coordination data
-- that older permissive role policies expose.
drop policy if exists "HIM patient read permission gate" on public.patients;
create policy "HIM patient read permission gate" on public.patients as restrictive for select to authenticated using (
  (select profile.role::text from public.profiles profile where profile.auth_user_id=auth.uid() and profile.status::text='active' limit 1) <> 'records_officer'
  or exists(select 1 from public.profiles profile where profile.auth_user_id=auth.uid() and profile.patient_id=patients.id)
  or (home_facility_id is not null and public.has_org_permission('patient.read',home_facility_id,null))
);
drop policy if exists "HIM patient update permission gate" on public.patients;
create policy "HIM patient update permission gate" on public.patients as restrictive for update to authenticated using (
  (select profile.role::text from public.profiles profile where profile.auth_user_id=auth.uid() and profile.status::text='active' limit 1) <> 'records_officer'
  or (home_facility_id is not null and public.has_org_permission('patient.update',home_facility_id,null))
) with check (
  (select profile.role::text from public.profiles profile where profile.auth_user_id=auth.uid() and profile.status::text='active' limit 1) <> 'records_officer'
  or (home_facility_id is not null and public.has_org_permission('patient.update',home_facility_id,null))
);

drop policy if exists "HIM referral read permission gate" on public.patient_record_referrals;
create policy "HIM referral read permission gate" on public.patient_record_referrals as restrictive for select to authenticated using (
  (select profile.role::text from public.profiles profile where profile.auth_user_id=auth.uid() and profile.status::text='active' limit 1) <> 'records_officer'
  or exists(select 1 from public.patients patient where patient.id=patient_record_referrals.patient_id
    and patient.home_facility_id is not null and public.has_org_permission('patient.read',patient.home_facility_id,null))
);
drop policy if exists "HIM referral update permission gate" on public.patient_record_referrals;
create policy "HIM referral update permission gate" on public.patient_record_referrals as restrictive for update to authenticated using (
  (select profile.role::text from public.profiles profile where profile.auth_user_id=auth.uid() and profile.status::text='active' limit 1) <> 'records_officer'
  or exists(select 1 from public.patients patient where patient.id=patient_record_referrals.patient_id
    and patient.home_facility_id is not null and public.has_org_permission('patient.update',patient.home_facility_id,null))
) with check (
  (select profile.role::text from public.profiles profile where profile.auth_user_id=auth.uid() and profile.status::text='active' limit 1) <> 'records_officer'
  or exists(select 1 from public.patients patient where patient.id=patient_record_referrals.patient_id
    and patient.home_facility_id is not null and public.has_org_permission('patient.update',patient.home_facility_id,null))
);

drop policy if exists "HIM appointment permission gate" on public.appointments;
create policy "HIM appointment permission gate" on public.appointments as restrictive for select to authenticated using (
  (select profile.role::text from public.profiles profile where profile.auth_user_id=auth.uid() and profile.status::text='active' limit 1) <> 'records_officer'
  or exists(select 1 from public.patients patient where patient.id=appointments.patient_id
    and patient.home_facility_id is not null and public.has_org_permission('portal.appointment.manage',patient.home_facility_id,null))
);

-- Let the patient see only their own safe checkout state and active provider
-- choices at their registered facility. Integration secrets remain server-only.
drop policy if exists "patient read own active payment gateways" on public.integration_connections;
create policy "patient read own active payment gateways" on public.integration_connections for select to authenticated using (
  integration_type='payment_gateway' and status='active'
  and exists(select 1 from public.profiles profile join public.patients patient on patient.id=profile.patient_id
    where profile.auth_user_id=auth.uid() and profile.status::text='active' and patient.home_facility_id=integration_connections.facility_id)
);
drop policy if exists "patient read own provider transactions" on public.payment_provider_transactions;
create policy "patient read own provider transactions" on public.payment_provider_transactions for select to authenticated using (
  exists(select 1 from public.profiles profile where profile.auth_user_id=auth.uid()
    and profile.status::text='active' and profile.patient_id=payment_provider_transactions.patient_id)
);

create or replace function public.request_patient_payment_checkout(
  p_billing_id uuid,p_connection_id uuid,p_amount numeric,p_idempotency_key text,p_currency text default 'NGN'
) returns uuid language plpgsql security definer set search_path=public as $$
declare invoice_row public.billing%rowtype; connection_row public.integration_connections%rowtype;
  actor_profile uuid; actor_patient uuid; patient_row public.patients%rowtype;
  transaction_id uuid; saved public.payment_provider_transactions%rowtype;
begin
  select id,patient_id into actor_profile,actor_patient from public.profiles
    where auth_user_id=auth.uid() and status::text='active' and role::text='patient' limit 1;
  if actor_profile is null or actor_patient is null then raise exception 'An active patient portal account is required'; end if;
  select * into invoice_row from public.billing where id=p_billing_id and patient_id=actor_patient for update;
  if not found then raise exception 'Invoice was not found for this patient'; end if;
  if invoice_row.balance is null or invoice_row.balance<=0 then raise exception 'There is no outstanding balance on this invoice'; end if;
  select * into patient_row from public.patients where id=actor_patient;
  select * into connection_row from public.integration_connections where id=p_connection_id
    and facility_id=patient_row.home_facility_id and integration_type='payment_gateway' and status='active';
  if not found then raise exception 'An active payment gateway is not configured for this facility'; end if;
  if p_amount is null or p_amount<=0 or p_amount>invoice_row.balance or p_currency !~ '^[A-Z]{3}$'
    or length(trim(coalesce(p_idempotency_key,'')))<8 then raise exception 'Invalid payment amount or checkout details'; end if;
  select * into saved from public.payment_provider_transactions where billing_id=p_billing_id and patient_id=actor_patient
    and status in ('creating','pending','review_pending') order by created_at desc limit 1;
  if found then return saved.id; end if;
  insert into public.payment_provider_transactions(connection_id,billing_id,patient_id,amount,currency,idempotency_key,created_by)
  values(p_connection_id,p_billing_id,actor_patient,p_amount,p_currency,trim(p_idempotency_key),actor_profile)
  on conflict(connection_id,idempotency_key) do nothing returning id into transaction_id;
  if transaction_id is null then
    select * into saved from public.payment_provider_transactions where connection_id=p_connection_id and idempotency_key=trim(p_idempotency_key);
    if saved.billing_id<>p_billing_id or saved.patient_id<>actor_patient or saved.amount<>p_amount
      or saved.currency<>p_currency or saved.created_by<>actor_profile then raise exception 'This checkout key was already used'; end if;
    return saved.id;
  end if;
  perform public.enqueue_integration_event(p_connection_id,'payment.intent.create','payment_intent',transaction_id,
    'payment-intent:'||transaction_id::text,
    jsonb_build_object('transaction_id',transaction_id,'invoice_id',p_billing_id,'amount',p_amount,
      'currency',p_currency,'idempotency_key',trim(p_idempotency_key),
      'customer',jsonb_build_object('email',patient_row.email,'name',concat_ws(' ',patient_row.first_name,patient_row.last_name))));
  return transaction_id;
end $$;
revoke all on function public.request_patient_payment_checkout(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.request_patient_payment_checkout(uuid,uuid,numeric,text,text) to authenticated;

notify pgrst,'reload schema';

drop policy if exists "records schedule patient requests" on public.appointments;
create policy "records schedule patient requests" on public.appointments for update to authenticated
  using (status='requested' and exists(select 1 from public.patients p where p.id=appointments.patient_id
    and p.home_facility_id is not null and public.has_org_permission('portal.appointment.manage',p.home_facility_id,null)))
  with check (status in ('scheduled','declined') and exists(select 1 from public.patients p where p.id=appointments.patient_id
    and p.home_facility_id is not null and public.has_org_permission('portal.appointment.manage',p.home_facility_id,null)));

create or replace function public.guard_records_appointment_scheduling() returns trigger
language plpgsql security definer set search_path=public as $$
declare facility uuid;
begin
  select home_facility_id into facility from public.patients where id=old.patient_id;
  if public.has_org_permission('portal.appointment.manage',facility,null) and not public.has_any_role(array['super_admin']) then
    if old.status <> 'requested' or new.status not in ('scheduled','declined')
       or new.patient_id is distinct from old.patient_id or new.appointment_type is distinct from old.appointment_type
       or new.department is distinct from old.department or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at then
      raise exception 'HIM staff may only confirm or decline an open patient appointment request.';
    end if;
    if new.status='scheduled' and (new.doctor_id is null or new.appointment_date is null or nullif(trim(new.appointment_time),'') is null) then
      raise exception 'Choose the confirmed doctor, date, and time before scheduling the appointment.';
    end if;
    if new.status='scheduled' and not exists(select 1 from public.profiles p where p.id=new.doctor_id and p.role::text='doctor' and p.status::text='active') then
      raise exception 'Only an active doctor can be assigned to the confirmed appointment.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.get_appointment_providers()
returns table(id uuid, full_name text, department text)
language sql stable security definer set search_path=public as $$
  select p.id,p.full_name,p.department from public.profiles p
  where p.role::text='doctor' and p.status::text='active'
    and (public.has_any_role(array['super_admin']) or exists(
      select 1 from public.staff_organization_memberships membership
      join public.organization_units unit on unit.id=membership.organization_unit_id
      where membership.profile_id=(select profile.id from public.profiles profile where profile.auth_user_id=auth.uid() limit 1)
        and membership.status='active' and membership.starts_on<=current_date
        and (membership.ends_on is null or membership.ends_on>=current_date)
        and unit.facility_id is not null
        and public.has_org_permission('portal.appointment.manage',unit.facility_id,null)
    )) order by p.full_name;
$$;
revoke all on function public.get_appointment_providers() from public,anon;
grant execute on function public.get_appointment_providers() to authenticated;

notify pgrst,'reload schema';
