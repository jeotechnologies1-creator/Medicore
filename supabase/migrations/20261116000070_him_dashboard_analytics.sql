begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

create index if not exists encounters_patient_started_idx on public.encounters(patient_id,started_at desc);
create index if not exists admissions_patient_admission_date_idx on public.admissions(patient_id,admission_date desc);
create index if not exists admissions_patient_discharge_date_idx on public.admissions(patient_id,discharge_date desc) where discharge_date is not null;
create index if not exists diagnosis_codes_facility_encounter_idx on public.encounter_diagnosis_codes(facility_id,encounter_id,code_system,code);

create or replace function public.get_him_dashboard_analytics(p_facility_id uuid,p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; actor uuid; visits bigint; admissions_count bigint; discharges bigint; deaths bigint; births bigint;
 diagnosed bigint; encounter_count bigint; signed_summaries bigint; discharged_count bigint; top_codes jsonb; departments jsonb;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or p_facility_id is null or p_start_date is null or p_end_date is null or p_end_date<p_start_date
   or not public.has_org_permission('records.file.read',p_facility_id,null) then
  raise exception 'HIM analytics requires an active staff profile, facility permission, and a valid date range.';
 end if;
 select count(*) into visits from public.encounters e join public.patients p on p.id=e.patient_id
  where p.home_facility_id=p_facility_id and e.started_at>=p_start_date and e.started_at<p_end_date+1;
 select count(*) into admissions_count from public.admissions a join public.patients p on p.id=a.patient_id
  where p.home_facility_id=p_facility_id and a.status<>'awaiting_bed' and a.admission_date between p_start_date and p_end_date;
 select count(*) into discharges from public.admissions a join public.patients p on p.id=a.patient_id
  where p.home_facility_id=p_facility_id and a.discharge_date between p_start_date and p_end_date and a.status='discharged';
 select count(*) into deaths from public.death_registrations d
  where d.facility_id=p_facility_id and d.verification_status='verified' and d.occurred_at>=p_start_date and d.occurred_at<p_end_date+1;
 select count(*) into births from public.birth_registrations b
  where b.facility_id=p_facility_id and b.verification_status='verified' and b.occurred_at>=p_start_date and b.occurred_at<p_end_date+1;

 select count(distinct e.id),count(distinct e.id) filter(where exists(select 1 from public.encounter_diagnosis_codes dc where dc.encounter_id=e.id))
 into encounter_count,diagnosed
 from public.encounters e join public.patients p on p.id=e.patient_id
 where p.home_facility_id=p_facility_id and e.started_at>=p_start_date and e.started_at<p_end_date+1;
 select count(*),count(*) filter(where exists(select 1 from public.admission_discharge_summaries s where s.admission_id=a.id and s.state='signed'))
 into discharged_count,signed_summaries from public.admissions a join public.patients p on p.id=a.patient_id
 where p.home_facility_id=p_facility_id and a.status='discharged' and a.discharge_date between p_start_date and p_end_date;

 select coalesce(jsonb_agg(jsonb_build_object('code_system',x.code_system,'code',x.code,'display',x.display_snapshot,'count',x.total)
   order by x.total desc,x.code_system,x.code),'[]'::jsonb) into top_codes
 from (select dc.code_system,dc.code,max(dc.display_snapshot) display_snapshot,count(*) total
   from public.encounter_diagnosis_codes dc join public.encounters e on e.id=dc.encounter_id join public.patients p on p.id=e.patient_id
   where dc.facility_id=p_facility_id and p.home_facility_id=p_facility_id and e.started_at>=p_start_date and e.started_at<p_end_date+1
   group by dc.code_system,dc.code order by count(*) desc,dc.code_system,dc.code limit 10) x;

 select coalesce(jsonb_agg(jsonb_build_object('department',x.department,'visits',x.visits,'admissions',x.admissions,'discharges',x.discharges)
   order by x.visits desc,x.department),'[]'::jsonb) into departments
 from (select coalesce(ap.department,cl.department,'Unspecified') department,
   count(distinct e.id) filter(where e.id is not null) visits,
   count(distinct a.id) filter(where a.status<>'awaiting_bed' and a.admission_date between p_start_date and p_end_date) admissions,
   count(distinct a.id) filter(where a.discharge_date between p_start_date and p_end_date and a.status='discharged') discharges
   from public.encounters e join public.patients p on p.id=e.patient_id
   left join public.appointments ap on ap.id=e.appointment_id left join public.profiles cl on cl.id=e.attending_clinician_id
   left join public.admissions a on a.encounter_id=e.id
   where p.home_facility_id=p_facility_id and ((e.started_at>=p_start_date and e.started_at<p_end_date+1)
      or a.admission_date between p_start_date and p_end_date or (a.discharge_date between p_start_date and p_end_date and a.status='discharged'))
   group by coalesce(ap.department,cl.department,'Unspecified')) x;

 result:=jsonb_build_object('facility_id',p_facility_id,'start_date',p_start_date,'end_date',p_end_date,
  'visits',visits,'admissions',admissions_count,'discharges',discharges,'verified_deaths',deaths,'verified_births',births,
  'record_completeness',jsonb_build_object('encounters_with_diagnosis',diagnosed,'encounter_count',encounter_count,
   'diagnosis_completion_percent',case when encounter_count=0 then null else round(100.0*diagnosed/encounter_count,2) end,
   'discharges_with_signed_summary',signed_summaries,'discharge_count',discharged_count,
   'signed_summary_percent',case when discharged_count=0 then null else round(100.0*signed_summaries/discharged_count,2) end),
  'top_diagnoses',top_codes,'department_performance',departments);
 return result;
end $$;
revoke all on function public.get_him_dashboard_analytics(uuid,date,date) from public,anon;
grant execute on function public.get_him_dashboard_analytics(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
