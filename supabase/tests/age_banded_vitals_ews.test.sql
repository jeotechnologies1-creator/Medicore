begin;
select plan(21);

select has_table('public','vital_thresholds','age and parameter alert thresholds are configured in the database');
select has_table('public','vital_score_escalation_levels','early warning escalation levels are configured in the database');
select has_column('public','vital_signs','age_at_reading_days','vital rows retain patient age at observation time');
select has_column('public','vital_signs','news2_score','adult NEWS2 is stored on the vital row');
select has_column('public','vital_signs','pews_score','paediatric score is stored on the vital row');
select has_column('public','vital_signs','supplemental_oxygen','oxygen support contributes to the score');
select has_column('public','vital_signs','spo2_scale','NEWS2 supports the prescribed hypercapnia saturation scale');
select has_function('public','calculate_news2',array['jsonb'],'adult NEWS2 calculation is server-side');
select has_function('public','calculate_pews',array['text','jsonb'],'paediatric score is calculated from approved age-band rules');
select is(public.calculate_news2('{"respiratory_rate":16,"oxygen_saturation":97,"blood_pressure_systolic":120,"heart_rate":80,"temperature":37,"consciousness":"A","supplemental_oxygen":false}'::jsonb),0,'normal complete adult observations score zero on NEWS2');
select is(public.calculate_news2('{"respiratory_rate":25,"oxygen_saturation":90,"blood_pressure_systolic":80,"heart_rate":135,"temperature":39.2,"consciousness":"U","supplemental_oxygen":true}'::jsonb),19,'NEWS2 sums parameter scores and supplemental oxygen points');
select is(public.calculate_news2('{"respiratory_rate":16,"oxygen_saturation":95,"blood_pressure_systolic":120,"heart_rate":80,"temperature":37,"consciousness":"A","supplemental_oxygen":true,"spo2_scale":"scale_2"}'::jsonb),4,'prescribed NEWS2 scale 2 uses its oxygen-dependent saturation bands');
insert into public.patients(id,first_name,last_name,date_of_birth) values('a4200000-0000-4000-8000-000000000001','Synthetic','Age Band Test','2026-10-01');
select is((select band from public.assign_vital_age_band('a4200000-0000-4000-8000-000000000001','2026-10-15 12:00:00+00')),'neonate','age band is calculated at the observation timestamp');
select is((select age_days from public.assign_vital_age_band('a4200000-0000-4000-8000-000000000001','2026-10-15 12:00:00+00')),14,'age at reading is measured in elapsed local calendar days');
select ok(exists(select 1 from pg_trigger where tgrelid='public.vital_signs'::regclass and tgname='score_vital_sign_observation' and not tgisinternal),'vital writes calculate and store their early warning score');
insert into public.vital_thresholds(score_system,age_band,parameter,low_value,high_value,severity,score_points)
select 'pews','neonate',p,-100000,100000,'warning',1 from unnest(array['heart_rate','respiratory_rate','blood_pressure_systolic','oxygen_saturation','temperature','consciousness','supplemental_oxygen']) p;
select is(public.calculate_pews('neonate','{"heart_rate":120,"respiratory_rate":30,"blood_pressure_systolic":80,"oxygen_saturation":96,"temperature":37,"consciousness":"A","supplemental_oxygen":false}'::jsonb),7,'paediatric score sums the configured age-band parameter rules');
select ok((select count(*)=6 and bool_and(not approved and approval_status='pending_clinical_approval') from public.vital_score_escalation_levels),'default escalation levels await local owner assignment and clinical approval');
select ok((select relrowsecurity from pg_class where oid='public.vital_thresholds'::regclass),'threshold configuration is protected by RLS');

insert into public.profiles(id,email,full_name,role,status) values('a4300000-0000-4000-8000-000000000001','ews-test-owner@example.invalid','Synthetic EWS Owner','nurse','active');
insert into public.patients(id,first_name,last_name,date_of_birth) values('a4300000-0000-4000-8000-000000000002','Synthetic','Adult EWS Test','1980-01-01');
insert into public.vital_thresholds(score_system,age_band,parameter,low_value,high_value,severity,approved,approval_status,approved_by,approved_at) values
 ('alert','adult','heart_rate',50,100,'critical',true,'approved','a4300000-0000-4000-8000-000000000001',now()),
 ('alert','adult','respiratory_rate',10,20,'urgent',true,'approved','a4300000-0000-4000-8000-000000000001',now()),
 ('alert','adult','temperature',35,38,'warning',true,'approved','a4300000-0000-4000-8000-000000000001',now());
update public.vital_score_escalation_levels set assigned_to='a4300000-0000-4000-8000-000000000001',approved=true,approval_status='approved',approved_by='a4300000-0000-4000-8000-000000000001',approved_at=now()
where score_system='news2' and min_score=5;
insert into public.vital_signs(id,patient_id,recorded_by,recorded_at,temperature,heart_rate,blood_pressure_systolic,blood_pressure_diastolic,respiratory_rate,oxygen_saturation,consciousness,supplemental_oxygen)
values('a4300000-0000-4000-8000-000000000003','a4300000-0000-4000-8000-000000000002','a4300000-0000-4000-8000-000000000001','2026-11-12 12:00:00+00',39.2,135,80,50,25,90,'U',true);
select is((select news2_score from public.vital_signs where id='a4300000-0000-4000-8000-000000000003'),19,'insert trigger stores the adult score on the vital row');
select is((select count(*)::integer from public.clinical_alerts where source_entity_id='a4300000-0000-4000-8000-000000000003'),3,'each abnormal parameter creates its own alert');
select is((select count(*)::integer from public.clinical_tasks where patient_id='a4300000-0000-4000-8000-000000000002' and task_type='vital_escalation'),1,'crossing an approved level creates one owned escalation task');

select * from finish();
rollback;
