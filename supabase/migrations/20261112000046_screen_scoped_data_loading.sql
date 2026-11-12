begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create extension if not exists pg_trgm;

create index if not exists patients_facility_status_created_idx
  on public.patients(home_facility_id,status,created_at desc,id);
create index if not exists patients_facility_name_order_idx
  on public.patients(home_facility_id,lower(last_name),lower(first_name),id);
create index if not exists patients_name_search_trgm_idx
  on public.patients using gin (lower(first_name || ' ' || last_name) gin_trgm_ops);
create index if not exists patients_phone_search_trgm_idx
  on public.patients using gin (phone gin_trgm_ops) where phone is not null;
create index if not exists patients_mrn_search_trgm_idx
  on public.patients using gin (lower(medical_record_number) gin_trgm_ops) where medical_record_number is not null;
create index if not exists appointments_date_status_idx on public.appointments(appointment_date,status,patient_id);
create index if not exists lab_orders_date_status_idx on public.lab_orders(ordered_date,status,patient_id);
create index if not exists admissions_status_patient_idx on public.admissions(status,patient_id);
create index if not exists vital_signs_patient_recorded_idx on public.vital_signs(patient_id,recorded_at desc);
create index if not exists vital_signs_recorded_patient_idx on public.vital_signs(recorded_at desc,patient_id);
create index if not exists billing_status_created_idx on public.billing(status,created_at desc);
create index if not exists clinical_alerts_status_severity_created_idx on public.clinical_alerts(status,severity,created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists profiles_facility_status_name_idx on public.profiles(facility_id,status,full_name);

create or replace function public.search_patients_page(
  p_query text default '', p_status text default null, p_facility_id uuid default null,
  p_offset integer default 0, p_limit integer default 50
) returns table(patient jsonb,total_count bigint)
language sql stable security invoker set search_path=public as $$
  with matches as (
    select p.* from public.patients p
    where (nullif(btrim(p_query),'') is null or
      lower(p.first_name || ' ' || p.last_name) like '%'||lower(btrim(p_query))||'%' or
      lower(coalesce(p.medical_record_number,'')) like '%'||lower(btrim(p_query))||'%' or
      lower(coalesce(p.patient_number,'')) like '%'||lower(btrim(p_query))||'%' or
      p.phone like '%'||btrim(p_query)||'%')
      and (p_status is null or p.status=p_status)
      and (p_facility_id is null or p.home_facility_id=p_facility_id)
  )
  select to_jsonb(matches),count(*) over() from matches
  order by lower(last_name),lower(first_name),id
  offset greatest(0,p_offset) limit least(100,greatest(1,p_limit));
$$;
revoke all on function public.search_patients_page(text,text,uuid,integer,integer) from public,anon;
grant execute on function public.search_patients_page(text,text,uuid,integer,integer) to authenticated;

create or replace function public.get_screen_kpis(p_facility_id uuid,p_from date,p_to date)
returns jsonb language sql stable security invoker set search_path=public as $$
  with scope as (select coalesce(p_facility_id,(select facility_id from public.profiles where auth_user_id=auth.uid() and status='active' limit 1)) as facility_id)
  select jsonb_build_object(
    'patients', (select count(*) from public.patients p,scope s where p.home_facility_id=s.facility_id),
    'appointments', (select count(*) from public.appointments a join public.patients p on p.id=a.patient_id,scope s where p.home_facility_id=s.facility_id and a.appointment_date between p_from and p_to),
    'pending_labs', (select count(*) from public.lab_orders l join public.patients p on p.id=l.patient_id,scope s where p.home_facility_id=s.facility_id and l.status='pending' and l.ordered_date between p_from and p_to),
    'active_admissions', (select count(*) from public.admissions a join public.patients p on p.id=a.patient_id,scope s where p.home_facility_id=s.facility_id and a.status='active'),
    'vitals', (select count(*) from public.vital_signs v join public.patients p on p.id=v.patient_id,scope s where p.home_facility_id=s.facility_id and v.recorded_at >= p_from::timestamptz and v.recorded_at < (p_to+1)::timestamptz),
    'facility_id',(select facility_id from scope),'from',p_from,'to',p_to
  );
$$;
revoke all on function public.get_screen_kpis(uuid,date,date) from public,anon;
grant execute on function public.get_screen_kpis(uuid,date,date) to authenticated;

commit;
