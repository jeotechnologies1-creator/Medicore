-- Disposable staging fixture. See docs/testing/performance-validation.md before use.
-- This script never commits generated patient or vital rows.
\if :{?patient_count}
\else
\set patient_count 100000
\endif
\if :{?vitals_per_patient}
\else
\set vitals_per_patient 20
\endif

begin;
set local statement_timeout='30min';
set local lock_timeout='5s';

create temp table load_test_patient_ids(id uuid primary key) on commit drop;
with generated as (
  insert into public.patients(patient_number,first_name,last_name,date_of_birth,gender,phone,status,registration_date)
  select 'LOAD-FIXTURE-'||g,
    'SyntheticPatient'||(g%10000), 'LoadFixture'||(g%2500), date '1970-01-01'+(g%18000),
    case when g%2=0 then 'female' else 'male' end,
    '+234800'||lpad((g%10000000)::text,7,'0'), 'active', current_date-(g%3650)
  from generate_series(1, :'patient_count'::integer) g
  returning id
)
insert into load_test_patient_ids select id from generated;

insert into public.vital_signs(patient_id,temperature,heart_rate,blood_pressure_systolic,blood_pressure_diastolic,oxygen_saturation,recorded_at)
select patient.id, 36.0+(sample.n%30)/10.0, 55+(sample.n%70), 90+(sample.n%50), 55+(sample.n%35), 90+(sample.n%10),
  now()-((sample.n%365)::text||' days')::interval
from load_test_patient_ids patient
cross join generate_series(1, :'vitals_per_patient'::integer) sample(n);

analyze public.patients;
analyze public.vital_signs;

-- Representative patient directory predicate and ordering. Capture plan rows,
-- actual time, buffers, and estimate error from the staging run.
explain (analyze,buffers,settings)
select id,patient_number,first_name,last_name,phone,status
from public.patients
where lower(first_name || ' ' || last_name || coalesce(' ' || patient_number,'') || coalesce(' ' || medical_record_number,'') || coalesce(' ' || phone,'')) like '%syntheticpatient12%'
order by lower(last_name),lower(first_name),id
limit 50;

-- Representative chart-open patient lookup and recent vital history page.
explain (analyze,buffers,settings)
select v.id,v.patient_id,v.temperature,v.heart_rate,v.recorded_at
from public.vital_signs v
join public.patients p on p.id=v.patient_id
where p.patient_number='LOAD-FIXTURE-1'
order by v.recorded_at desc
limit 50;

-- Facility dashboard timing is exercised under a real caller JWT by the k6
-- script (RPC get_screen_kpis); see load-test-him-dashboard.sql for SQL plan.
rollback;
