-- Seed-free local Supabase/Postgres load fixture. Run with psql against a
-- disposable environment; every generated row is rolled back at the end.
-- Target: 100,000 patients and 2,000,000 vitals rows; indexed 50-row patient
-- list and recent-vitals page queries should each complete in under 1 second
-- on the project's documented production-equivalent database class.
begin;
set local statement_timeout='15min';
set local lock_timeout='5s';

create temp table load_test_patient_ids(id uuid primary key) on commit drop;
with generated as (
  insert into public.patients(patient_number,first_name,last_name,date_of_birth,gender,phone,status,registration_date)
  select 'LOAD-'||g,
    'Patient'||(g%10000), 'Synthetic'||(g%2500), date '1970-01-01'+(g%18000),
    case when g%2=0 then 'female' else 'male' end,
    '+234800'||lpad((g%10000000)::text,7,'0'), 'active', current_date-(g%3650)
  from generate_series(1,100000) g
  returning id
)
insert into load_test_patient_ids select id from generated;

insert into public.vital_signs(patient_id,temperature,heart_rate,blood_pressure_systolic,blood_pressure_diastolic,oxygen_saturation,recorded_at)
select patient.id, 36.0+(sample.n%30)/10.0, 55+(sample.n%70), 90+(sample.n%50), 55+(sample.n%35), 90+(sample.n%10),
  now()-((sample.n%365)::text||' days')::interval
from load_test_patient_ids patient
cross join generate_series(1,20) sample(n);

analyze public.patients;
analyze public.vital_signs;

explain (analyze,buffers)
select id,patient_number,first_name,last_name,phone,status
from public.patients
where status='active' and lower(concat_ws(' ',first_name,last_name)) like '%patient12%'
order by lower(last_name),lower(first_name),id
limit 50;

explain (analyze,buffers)
select id,patient_id,temperature,heart_rate,recorded_at
from public.vital_signs
where recorded_at>=now()-interval '7 days'
order by recorded_at desc
limit 50;

rollback;
