begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Facility rules stay inactive until a named clinical owner approves them.
create table if not exists public.vital_thresholds (
  id uuid primary key default gen_random_uuid(),
  score_system text not null check(score_system in ('alert','pews')),
  age_band text not null check(age_band in ('neonate','infant','child','adolescent','adult')),
  parameter text not null check(parameter in ('heart_rate','respiratory_rate','blood_pressure_systolic','oxygen_saturation','temperature','consciousness','supplemental_oxygen')),
  low_value numeric,
  high_value numeric,
  severity text not null check(severity in ('warning','urgent','critical')),
  score_points smallint,
  approved boolean not null default false,
  approval_status text not null default 'pending_clinical_approval' check(approval_status in ('pending_clinical_approval','approved','rejected')),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check(low_value is not null or high_value is not null),
  check(low_value is null or high_value is null or low_value<=high_value),
  check(score_system<>'pews' or (score_points is not null and score_points between 0 and 4)),
  check(approved=(approval_status='approved')),
  check(not approved or (approved_by is not null and approved_at is not null)),
  unique(score_system,age_band,parameter,low_value,high_value)
);
create index if not exists vital_threshold_lookup_idx on public.vital_thresholds(score_system,age_band,parameter) where approved;
create unique index if not exists vital_one_alert_threshold_per_parameter_idx on public.vital_thresholds(age_band,parameter) where score_system='alert';

create table if not exists public.vital_score_escalation_levels (
  id uuid primary key default gen_random_uuid(),
  score_system text not null check(score_system in ('news2','pews')),
  min_score integer not null check(min_score>=0),
  severity text not null check(severity in ('warning','urgent','critical')),
  due_minutes integer not null check(due_minutes between 0 and 1440),
  assigned_to uuid references public.profiles(id) on delete restrict,
  approved boolean not null default false,
  approval_status text not null default 'pending_clinical_approval' check(approval_status in ('pending_clinical_approval','approved','rejected')),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check(approved=(approval_status='approved')),
  check(not approved or (approved_by is not null and approved_at is not null and assigned_to is not null)),
  unique(score_system,min_score)
);
insert into public.vital_score_escalation_levels(score_system,min_score,severity,due_minutes) values
 ('news2',5,'urgent',60),('news2',7,'critical',15),
 ('pews',1,'warning',60),('pews',5,'urgent',30),('pews',9,'urgent',15),('pews',13,'critical',0)
on conflict(score_system,min_score) do nothing;

alter table public.vital_signs add column if not exists supplemental_oxygen boolean not null default false;
alter table public.vital_signs add column if not exists spo2_scale text not null default 'scale_1' check(spo2_scale in ('scale_1','scale_2'));
alter table public.vital_signs add column if not exists age_at_reading_days integer;
alter table public.vital_signs add column if not exists age_band text;
alter table public.vital_signs add column if not exists news2_score integer;
alter table public.vital_signs add column if not exists pews_score integer;
alter table public.vital_signs add column if not exists score_system text;
alter table public.vital_signs add column if not exists score_status text not null default 'incomplete';
alter table public.vital_signs add constraint vital_signs_age_band_check check(age_band is null or age_band in ('neonate','infant','child','adolescent','adult'));
alter table public.vital_signs add constraint vital_signs_score_system_check check(score_system is null or score_system in ('news2','pews'));
alter table public.vital_signs add constraint vital_signs_score_status_check check(score_status in ('incomplete','calculated','pending_clinical_approval'));

create or replace function public.calculate_news2(p_observation jsonb)
returns integer language plpgsql immutable set search_path=public as $$
declare rr numeric; spo2 numeric; systolic numeric; pulse numeric; temp numeric; consciousness text; result integer:=0;
begin
  rr:=nullif(p_observation->>'respiratory_rate','')::numeric;
  spo2:=nullif(p_observation->>'oxygen_saturation','')::numeric;
  systolic:=nullif(p_observation->>'blood_pressure_systolic','')::numeric;
  pulse:=nullif(p_observation->>'heart_rate','')::numeric;
  temp:=nullif(p_observation->>'temperature','')::numeric;
  consciousness:=upper(regexp_replace(coalesce(p_observation->>'consciousness',''),'[^A-Za-z]','','g'));
  if rr is null or spo2 is null or systolic is null or pulse is null or temp is null or consciousness='' then return null; end if;
  result:=result+case when rr<=8 then 3 when rr between 9 and 11 then 1 when rr between 12 and 20 then 0 when rr between 21 and 24 then 2 else 3 end;
  if coalesce(p_observation->>'spo2_scale','scale_1')='scale_2' then
    result:=result+case when spo2<=83 then 3 when spo2 between 84 and 85 then 2 when spo2 between 86 and 87 then 1 when spo2<=92 then 0
      when not coalesce((p_observation->>'supplemental_oxygen')::boolean,false) then 0 when spo2 between 93 and 94 then 1 when spo2 between 95 and 96 then 2 else 3 end;
  else
    result:=result+case when spo2<=91 then 3 when spo2 between 92 and 93 then 2 when spo2 between 94 and 95 then 1 else 0 end;
  end if;
  result:=result+case when systolic<=90 then 3 when systolic between 91 and 100 then 2 when systolic between 101 and 110 then 1 when systolic between 111 and 219 then 0 else 3 end;
  result:=result+case when pulse<=40 then 3 when pulse between 41 and 50 then 1 when pulse between 51 and 90 then 0 when pulse between 91 and 110 then 1 when pulse between 111 and 130 then 2 else 3 end;
  result:=result+case when temp<=35 then 3 when temp<=36 then 1 when temp<=38 then 0 when temp<=39 then 1 else 2 end;
  if consciousness not in ('A','ALERT','ACVPUA') then result:=result+3; end if;
  if coalesce((p_observation->>'supplemental_oxygen')::boolean,false) then result:=result+2; end if;
  return result;
end $$;
revoke all on function public.calculate_news2(jsonb) from public,anon,authenticated;

create or replace function public.calculate_pews(p_age_band text,p_observation jsonb)
returns integer language plpgsql stable security definer set search_path=public as $$
declare rule record; observed numeric; result integer:=0; parameter_name text;
begin
  if p_age_band not in ('neonate','infant','child','adolescent') then return null; end if;
  foreach parameter_name in array array['heart_rate','respiratory_rate','blood_pressure_systolic','oxygen_saturation','temperature','consciousness','supplemental_oxygen'] loop
    observed:=case parameter_name
      when 'heart_rate' then nullif(p_observation->>'heart_rate','')::numeric
      when 'respiratory_rate' then nullif(p_observation->>'respiratory_rate','')::numeric
      when 'blood_pressure_systolic' then nullif(p_observation->>'blood_pressure_systolic','')::numeric
      when 'oxygen_saturation' then nullif(p_observation->>'oxygen_saturation','')::numeric
      when 'temperature' then nullif(p_observation->>'temperature','')::numeric
      when 'consciousness' then case upper(regexp_replace(coalesce(p_observation->>'consciousness',''),'[^A-Za-z]','','g')) when 'A' then 0 when 'ALERT' then 0 when 'C' then 1 when 'CONFUSION' then 1 when 'V' then 2 when 'P' then 3 when 'U' then 4 else null end
      when 'supplemental_oxygen' then case when coalesce((p_observation->>'supplemental_oxygen')::boolean,false) then 1 else 0 end
    end;
    if observed is null then return null; end if;
    select * into rule from public.vital_thresholds t where t.score_system='pews' and t.age_band=p_age_band and t.parameter=parameter_name
      and (t.low_value is null or observed>=t.low_value) and (t.high_value is null or observed<=t.high_value)
    order by t.approved desc,t.score_points desc limit 1;
    if not found then return null; end if;
    result:=result+rule.score_points;
  end loop;
  return result;
end $$;
revoke all on function public.calculate_pews(text,jsonb) from public,anon,authenticated;


create or replace function public.assign_vital_age_band(p_patient_id uuid,p_recorded_at timestamptz)
returns table(age_days integer,band text) language plpgsql stable security definer set search_path=public as $$
declare born date; observed_date date; timezone_name text;
begin
  select p.date_of_birth,coalesce(f.timezone,'Africa/Lagos') into born,timezone_name from public.patients p
    left join public.facilities f on f.id=p.home_facility_id where p.id=p_patient_id;
  if born is null then return query select null::integer,null::text; return; end if;
  observed_date:=(p_recorded_at at time zone timezone_name)::date;
  age_days:=observed_date-born;
  if age_days<0 then age_days:=null; band:=null; return next; return; end if;
  if observed_date<born+interval '28 days' then band:='neonate';
  elsif observed_date<born+interval '1 year' then band:='infant';
  elsif observed_date<born+interval '13 years' then band:='child';
  elsif observed_date<born+interval '18 years' then band:='adolescent';
  else band:='adult'; end if;
  return next;
end $$;
revoke all on function public.assign_vital_age_band(uuid,timestamptz) from public,anon,authenticated;

create or replace function public.score_vital_sign_observation()
returns trigger language plpgsql security definer set search_path=public as $$
declare patient_band text; patient_age_days integer; observation jsonb; pending_pews boolean;
begin
  perform 1 from public.patients where id=new.patient_id for update;
  select x.age_days,x.band into patient_age_days,patient_band from public.assign_vital_age_band(new.patient_id,new.recorded_at) x;
  new.age_at_reading_days:=patient_age_days;
  new.age_band:=patient_band;
  observation:=to_jsonb(new);
  if patient_band='adult' then
    new.score_system:='news2';
    new.news2_score:=public.calculate_news2(observation);
    new.pews_score:=null;
    new.score_status:=case when new.news2_score is null then 'incomplete' else 'calculated' end;
  elsif patient_band in ('neonate','infant','child','adolescent') then
    new.score_system:='pews';
    new.news2_score:=null;
    new.pews_score:=public.calculate_pews(patient_band,observation);
    select exists(select 1 from public.vital_thresholds where score_system='pews' and age_band=patient_band and not approved)
      or not exists(select 1 from public.vital_thresholds where score_system='pews' and age_band=patient_band) into pending_pews;
    new.score_status:=case when pending_pews then 'pending_clinical_approval' when new.pews_score is null then 'incomplete' else 'calculated' end;
  else
    new.score_system:=null; new.news2_score:=null; new.pews_score:=null; new.score_status:='incomplete';
  end if;
  return new;
end $$;
revoke all on function public.score_vital_sign_observation() from public,anon,authenticated;
drop trigger if exists score_vital_sign_observation on public.vital_signs;
create trigger score_vital_sign_observation before insert or update of patient_id,recorded_at,temperature,heart_rate,blood_pressure_systolic,blood_pressure_diastolic,respiratory_rate,oxygen_saturation,consciousness,supplemental_oxygen,spo2_scale,age_at_reading_days,age_band,news2_score,pews_score,score_system,score_status on public.vital_signs
for each row execute function public.score_vital_sign_observation();

-- Populate age-at-reading and available scores for existing observations.
update public.vital_signs set recorded_at=recorded_at;

create or replace function public.raise_vital_sign_alert()
returns trigger language plpgsql security definer set search_path=public as $$
declare rule record; observed numeric; task_level record; previous_score integer; score_now integer;
begin
  for rule in select * from public.vital_thresholds where score_system='alert' and age_band=new.age_band and approved and approval_status='approved' loop
    observed:=case rule.parameter
      when 'heart_rate' then new.heart_rate
      when 'respiratory_rate' then new.respiratory_rate
      when 'blood_pressure_systolic' then new.blood_pressure_systolic
      when 'oxygen_saturation' then new.oxygen_saturation
      when 'temperature' then new.temperature
      when 'consciousness' then case upper(regexp_replace(coalesce(new.consciousness,''),'[^A-Za-z]','','g')) when 'A' then 0 when 'ALERT' then 0 when 'C' then 1 when 'CONFUSION' then 1 when 'V' then 2 when 'P' then 3 when 'U' then 4 else null end
      when 'supplemental_oxygen' then case when new.supplemental_oxygen then 1 else 0 end
    end;
    if observed is null or ((rule.low_value is null or observed>=rule.low_value) and (rule.high_value is null or observed<=rule.high_value)) then continue; end if;
    insert into public.clinical_alerts(patient_id,encounter_id,alert_type,severity,message,source_entity_type,source_entity_id)
    values(new.patient_id,new.encounter_id,'vital',case when rule.severity in ('urgent','critical') then 'critical' else 'warning' end,
      format('%s outside approved %s range: %s',replace(rule.parameter,'_',' '),new.age_band,observed),'vital_signs:'||rule.parameter,new.id);
  end loop;

  score_now:=case new.score_system when 'news2' then new.news2_score when 'pews' then new.pews_score else null end;
  if score_now is null or new.score_status<>'calculated' then return new; end if;
  select case v.score_system when 'news2' then v.news2_score else v.pews_score end into previous_score
    from public.vital_signs v where v.patient_id=new.patient_id and v.recorded_at<new.recorded_at and v.score_system=new.score_system
    order by v.recorded_at desc limit 1;
  select * into task_level from public.vital_score_escalation_levels e where e.score_system=new.score_system and e.approved and e.approval_status='approved'
    and score_now>=e.min_score and coalesce(previous_score,-1)<e.min_score order by e.min_score desc limit 1;
  if found then
    insert into public.clinical_tasks(patient_id,encounter_id,assigned_to,created_by,task_type,title,due_at,priority,notes)
    values(new.patient_id,new.encounter_id,task_level.assigned_to,new.recorded_by,'vital_escalation',
      format('%s early warning score escalation (%s)',upper(new.score_system),score_now),
      now()+make_interval(mins=>task_level.due_minutes),
      case task_level.severity when 'critical' then 'stat' when 'urgent' then 'urgent' else 'routine' end,
      format('Observation %s; age band %s; score %s crossed configured level %s.',new.id,new.age_band,score_now,task_level.min_score));
  end if;
  return new;
end $$;
revoke all on function public.raise_vital_sign_alert() from public,anon,authenticated;
drop trigger if exists vital_signs_alert on public.vital_signs;
create trigger vital_signs_alert after insert on public.vital_signs for each row execute function public.raise_vital_sign_alert();

alter table public.vital_thresholds enable row level security;
alter table public.vital_score_escalation_levels enable row level security;
revoke all on public.vital_thresholds,public.vital_score_escalation_levels from public,anon,authenticated;
grant select on public.vital_thresholds,public.vital_score_escalation_levels to authenticated;
grant select,insert,update,delete on public.vital_thresholds,public.vital_score_escalation_levels to service_role;
drop policy if exists "read approved vital thresholds" on public.vital_thresholds;
create policy "read approved vital thresholds" on public.vital_thresholds for select to authenticated using(approved and approval_status='approved');
drop policy if exists "read approved vital escalation levels" on public.vital_score_escalation_levels;
create policy "read approved vital escalation levels" on public.vital_score_escalation_levels for select to authenticated using(approved and approval_status='approved');

commit;
notify pgrst,'reload schema';
