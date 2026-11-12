begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Rule tables intentionally ship empty. Load only institution-approved rules.
create table if not exists public.allergen_classes (
  id uuid primary key default gen_random_uuid(),
  code_system text not null,
  code text not null,
  display text not null,
  active boolean not null default true,
  unique(code_system,code),
  foreign key(code_system,code) references public.concepts(system,code) on update cascade on delete restrict
);
create table if not exists public.formulary_allergen_map (
  id uuid primary key default gen_random_uuid(),
  formulary_item_id uuid not null references public.formulary_items(id) on delete restrict,
  allergen_class_id uuid references public.allergen_classes(id) on delete restrict,
  allergen_code_system text,
  allergen_code text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  check ((allergen_class_id is not null and allergen_code_system is null and allergen_code is null)
      or (allergen_class_id is null and allergen_code_system is not null and allergen_code is not null)),
  foreign key(allergen_code_system,allergen_code) references public.concepts(system,code) on update cascade on delete restrict
);
create index if not exists formulary_allergen_item_idx on public.formulary_allergen_map(formulary_item_id) where approved;
create index if not exists formulary_allergen_code_idx on public.formulary_allergen_map(allergen_code_system,allergen_code) where approved;

create table if not exists public.drug_interactions (
  id uuid primary key default gen_random_uuid(),
  formulary_item_a uuid not null references public.formulary_items(id) on delete restrict,
  formulary_item_b uuid not null references public.formulary_items(id) on delete restrict,
  severity text not null check(severity in ('contraindicated','severe','major','moderate','minor')),
  interaction_text text not null,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  approved boolean not null default false,
  check(formulary_item_a<formulary_item_b),
  constraint drug_interactions_approval_check check(not approved or (approved_by is not null and approved_at is not null)),
  unique(formulary_item_a,formulary_item_b)
);
create index if not exists drug_interactions_a_idx on public.drug_interactions(formulary_item_a) where approved;
create index if not exists drug_interactions_b_idx on public.drug_interactions(formulary_item_b) where approved;

create table if not exists public.dose_limits (
  id uuid primary key default gen_random_uuid(),
  formulary_item_id uuid not null references public.formulary_items(id) on delete restrict,
  age_min_months integer,
  age_max_months integer,
  weight_basis text not null default 'fixed' check(weight_basis in ('fixed','per_kg')),
  dose_unit text not null,
  min_per_dose numeric(14,5),
  max_per_dose numeric(14,5),
  min_per_day numeric(14,5),
  max_per_day numeric(14,5),
  renal_note text,
  pregnancy_note text,
  approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  check(age_min_months is null or age_min_months>=0),
  check(age_max_months is null or age_max_months>=0),
  check(age_min_months is null or age_max_months is null or age_max_months>=age_min_months),
  check(min_per_dose is null or min_per_dose>=0), check(max_per_dose is null or max_per_dose>0),
  check(min_per_day is null or min_per_day>=0), check(max_per_day is null or max_per_day>0),
  check(min_per_dose is null or max_per_dose is null or max_per_dose>=min_per_dose),
  check(min_per_day is null or max_per_day is null or max_per_day>=min_per_day),
  check(not approved or (approved_by is not null and approved_at is not null))
);
create index if not exists dose_limits_item_approved_idx on public.dose_limits(formulary_item_id) where approved;

create table if not exists public.patient_medication_risk_flags (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  risk_type text not null check(risk_type in ('pregnancy','renal_impairment')),
  status text not null default 'active' check(status in ('active','resolved')),
  details text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists patient_medication_risk_active_idx on public.patient_medication_risk_flags(patient_id,risk_type) where status='active';

create table if not exists public.medication_safety_overrides (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  formulary_item_id uuid not null references public.formulary_items(id) on delete restrict,
  finding_key text not null,
  item_signature text not null check(item_signature ~ '^[0-9a-f]{32}$'),
  finding jsonb not null,
  reason text not null check(length(btrim(reason))>=10),
  prescriber_id uuid not null references public.profiles(id) on delete restrict,
  second_approver_id uuid references public.profiles(id) on delete restrict,
  status text not null check(status in ('pending_second_approval','approved','used')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  used_at timestamptz,
  used_record_type text check(used_record_type in ('prescription_item','medication_order')),
  used_record_id uuid,
  constraint medication_safety_overrides_second_approver_check check(second_approver_id is null or second_approver_id<>prescriber_id),
  check((status='pending_second_approval' and second_approver_id is null and approved_at is null and used_at is null)
     or (status='approved' and approved_at is not null and used_at is null)
     or (status='used' and approved_at is not null and used_at is not null and used_record_type is not null and used_record_id is not null))
);
create index if not exists medication_safety_override_lookup_idx on public.medication_safety_overrides(patient_id,formulary_item_id,finding_key,status);

create or replace function public.check_prescription(p_patient_id uuid,p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare item record; prior_item record; lim record; interaction record; allergy record; patient_dob date;
  age_months integer; current_weight numeric; weight_at timestamptz; item_id uuid; item_dose numeric; item_unit text;
  item_frequency text; daily_factor numeric; per_dose numeric; per_day numeric; renal_flag boolean; pregnancy_flag boolean;
  has_rules boolean; findings jsonb:='[]'::jsonb; severity_name text;
begin
  if p_patient_id is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'A patient and at least one medication item are required.' using errcode='22023';
  end if;
  if not public.has_any_role(array['super_admin','doctor','specialist','pharmacist']) then raise exception 'Medication safety check access denied.'; end if;
  if not public.has_clinical_department_permission(p_patient_id,null,'medication.prescribe',false)
     and not public.has_clinical_department_permission(p_patient_id,null,'medication.dispense',false) then
    raise exception 'Medication safety check access denied.';
  end if;
  select date_of_birth into patient_dob from public.patients where id=p_patient_id;
  if not found then raise exception 'Patient not found.'; end if;
  if patient_dob is not null then age_months=(extract(year from age(current_date,patient_dob))*12+extract(month from age(current_date,patient_dob)))::integer; end if;
  select weight,recorded_at into current_weight,weight_at from public.vital_signs where patient_id=p_patient_id and weight>0 order by recorded_at desc limit 1;
  select exists(select 1 from public.patient_medication_risk_flags where patient_id=p_patient_id and risk_type='renal_impairment' and status='active') into renal_flag;
  select exists(select 1 from public.patient_medication_risk_flags where patient_id=p_patient_id and risk_type='pregnancy' and status='active') into pregnancy_flag;

  for item in select value,ordinality from jsonb_array_elements(p_items) with ordinality loop
    item_id:=nullif(item.value->>'formulary_item_id','')::uuid;
    if item_id is null or not exists(select 1 from public.formulary_items where id=item_id and active) then
      findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','invalid_formulary_item','type','invalid_formulary_item','severity','blocking','blocking',true,'formulary_item_id',item.value->>'formulary_item_id','message','Medication must reference an active formulary item.'));
      continue;
    end if;
    item_dose:=case when coalesce(item.value->>'dose','') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'dose')::numeric else null end;
    item_unit:=nullif(lower(btrim(item.value->>'dose_unit')),'');
    item_frequency:=lower(regexp_replace(coalesce(item.value->>'frequency',''),'\s+','','g'));
    daily_factor:=case item_frequency when 'od' then 1 when 'daily' then 1 when 'oncedaily' then 1 when 'qd' then 1
      when 'bd' then 2 when 'bid' then 2 when 'twicedaily' then 2 when 'tds' then 3 when 'tid' then 3
      when 'threetimesdaily' then 3 when 'qid' then 4 when 'fourtimesdaily' then 4 when 'q6h' then 4
      when 'q8h' then 3 when 'q12h' then 2 else null end;

    -- Only confirmed active, coded allergies are considered. Display text is never used.
    for allergy in
      select distinct pa.id,pa.criticality,pa.severity,pa.substance,m.id as map_id
      from public.patient_allergies pa join public.formulary_allergen_map m on m.formulary_item_id=item_id and m.approved
      left join public.allergen_classes ac on ac.id=m.allergen_class_id and ac.active
      where pa.patient_id=p_patient_id and pa.category='medication' and pa.clinical_status='active'
        and pa.verification_status='confirmed' and pa.code_system is not null and pa.code is not null
        and ((m.allergen_code_system=pa.code_system and m.allergen_code=pa.code)
          or (m.allergen_class_id is not null and ac.code_system=pa.code_system and ac.code=pa.code))
    loop
      severity_name:=case when allergy.criticality='high' or allergy.severity='severe' then 'severe' else 'major' end;
      findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','allergy:'||allergy.map_id,'type','allergy','severity',severity_name,'blocking',true,
        'formulary_item_id',item_id,'message','Coded medication allergy match: '||coalesce(allergy.substance,'coded allergen')||'.'));
    end loop;

    -- Duplicate therapy is a warning; approved interaction severity controls blocking.
    if exists(select 1 from public.medication_orders mo where mo.patient_id=p_patient_id and mo.formulary_item_id=item_id and mo.status='active')
      or exists(select 1 from public.prescription_items pi join public.prescriptions p on p.id=pi.prescription_id where p.patient_id=p_patient_id and pi.formulary_item_id=item_id and p.status in ('active','dispensed'))
      or exists(select 1 from jsonb_array_elements(p_items) with ordinality x(value,ordinality) where x.value->>'formulary_item_id'=item_id::text and x.ordinality<>item.ordinality) then
      findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','duplicate:'||item_id,'type','duplicate_therapy','severity','moderate','blocking',false,
        'formulary_item_id',item_id,'message','This patient already has an active order for this formulary item.'));
    end if;
    for prior_item in
      select mo.formulary_item_id as other_id from public.medication_orders mo where mo.patient_id=p_patient_id and mo.status='active' and mo.formulary_item_id is not null
      union select pi.formulary_item_id from public.prescription_items pi join public.prescriptions p on p.id=pi.prescription_id where p.patient_id=p_patient_id and p.status in ('active','dispensed')
      union select (x.value->>'formulary_item_id')::uuid from jsonb_array_elements(p_items) with ordinality x(value,ordinality) where x.ordinality<item.ordinality
    loop
      if prior_item.other_id=item_id then continue; end if;
      for interaction in select d.* from public.drug_interactions d where d.approved and
        ((d.formulary_item_a=item_id and d.formulary_item_b=prior_item.other_id) or (d.formulary_item_b=item_id and d.formulary_item_a=prior_item.other_id))
      loop
        severity_name:=case when interaction.severity in ('contraindicated','severe','major') then 'severe' else interaction.severity end;
        findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','interaction:'||interaction.id,'type','drug_interaction','severity',severity_name,
          'blocking',interaction.severity in ('contraindicated','severe','major'),'formulary_item_id',item_id,'other_formulary_item_id',prior_item.other_id,'message',interaction.interaction_text));
      end loop;
    end loop;

    if item_dose is null or item_unit is null then
      findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','dose_unparseable:'||item_id,'type','dose_data','severity','warning','blocking',false,
        'formulary_item_id',item_id,'message','Dose is not numeric with a unit; approved dose limits could not be evaluated.'));
    end if;
    for lim in select * from public.dose_limits d where d.formulary_item_id=item_id and d.approved loop
      if age_months is null and (lim.age_min_months is not null or lim.age_max_months is not null) then
        findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','age_missing:'||lim.id,'type','dose_limit','severity','warning','blocking',false,'formulary_item_id',item_id,'message','Patient age is unavailable for the approved dose band.'));
        continue;
      end if;
      if (lim.age_min_months is not null and age_months<lim.age_min_months) or (lim.age_max_months is not null and age_months>lim.age_max_months) then continue; end if;
      if lim.weight_basis='per_kg' and current_weight is null then
        findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','weight_missing:'||lim.id,'type','weight_required','severity','severe','blocking',true,'formulary_item_id',item_id,'message','An approved weight-based dose rule requires a recorded patient weight.'));
        continue;
      end if;
      if lim.weight_basis='per_kg' and age_months is null then
        findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','age_missing_weight:'||lim.id,'type','dose_limit','severity','warning','blocking',false,'formulary_item_id',item_id,'message','Patient age is unavailable; confirm whether the weight must be recent for an under-18 patient.'));
      end if;
      if lim.weight_basis='per_kg' and age_months<216 and weight_at<now()-interval '30 days' then
        findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','weight_stale:'||lim.id,'type','weight_required','severity','severe','blocking',true,'formulary_item_id',item_id,'message','A patient under 18 needs a weight recorded within the last 30 days for this weight-based medicine.'));
        continue;
      end if;
      if item_dose is null or item_unit is distinct from lower(lim.dose_unit) then continue; end if;
      per_dose:=case when lim.weight_basis='per_kg' then item_dose/current_weight else item_dose end;
      per_day:=case when daily_factor is null then null else per_dose*daily_factor end;
      if (lim.min_per_dose is not null and per_dose<lim.min_per_dose) or (lim.max_per_dose is not null and per_dose>lim.max_per_dose)
        or (daily_factor is not null and lim.min_per_day is not null and per_day<lim.min_per_day)
        or (daily_factor is not null and lim.max_per_day is not null and per_day>lim.max_per_day) then
        findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','dose_limit:'||lim.id,'type','dose_limit','severity','severe','blocking',true,'formulary_item_id',item_id,'message','Dose is outside the approved limit for this age, weight, or frequency band.'));
      elsif ((lim.max_per_day is not null or lim.min_per_day is not null) and daily_factor is null) then
        findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','frequency_unknown:'||lim.id,'type','dose_limit','severity','warning','blocking',false,'formulary_item_id',item_id,'message','Frequency could not be normalized to evaluate the approved daily dose limit.'));
      end if;
      if renal_flag and nullif(btrim(lim.renal_note),'') is not null then findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','renal_note:'||lim.id,'type','renal_risk','severity','warning','blocking',false,'formulary_item_id',item_id,'message',lim.renal_note)); end if;
      if pregnancy_flag and nullif(btrim(lim.pregnancy_note),'') is not null then findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','pregnancy_note:'||lim.id,'type','pregnancy_risk','severity','warning','blocking',false,'formulary_item_id',item_id,'message',lim.pregnancy_note)); end if;
    end loop;

    select exists(select 1 from public.formulary_allergen_map where formulary_item_id=item_id and approved)
      or exists(select 1 from public.dose_limits where formulary_item_id=item_id and approved)
      or exists(select 1 from public.drug_interactions where approved and (formulary_item_a=item_id or formulary_item_b=item_id)) into has_rules;
    if not has_rules then findings:=findings||jsonb_build_array(jsonb_build_object('finding_key','no_rules_loaded:'||item_id,'type','no_rules_loaded','severity','warning','blocking',false,'formulary_item_id',item_id,'message','No approved medication safety rules are loaded for this formulary item.')); end if;
  end loop;
  return jsonb_build_object('patient_id',p_patient_id,'findings',findings,
    'blocking',coalesce((select jsonb_agg(f) from jsonb_array_elements(findings) f where (f->>'blocking')::boolean), '[]'::jsonb),
    'warnings',coalesce((select jsonb_agg(f) from jsonb_array_elements(findings) f where not (f->>'blocking')::boolean), '[]'::jsonb));
end $$;
revoke all on function public.check_prescription(uuid,jsonb) from public,anon;
grant execute on function public.check_prescription(uuid,jsonb) to authenticated;

create or replace function public.request_medication_safety_override(
  p_patient_id uuid,p_items jsonb,p_finding_keys text[],p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_id uuid; check_result jsonb; finding jsonb; entry jsonb; item_id uuid; signature text; requested integer:=0; severe boolean;
begin
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('doctor','specialist','super_admin') limit 1;
  if actor_id is null then raise exception 'Only an active prescriber can request a medication safety override'; end if;
  if public.mfa_required_for_current_user() and not public.has_aal2() then raise exception 'Multi-factor authentication is required for a safety override'; end if;
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<10 or coalesce(array_length(p_finding_keys,1),0)=0 then raise exception 'A detailed reason and blocking finding keys are required'; end if;
  check_result:=public.check_prescription(p_patient_id,p_items);
  for finding in select value from jsonb_array_elements(check_result->'blocking') loop
    if not (finding->>'finding_key'=any(p_finding_keys)) then continue; end if;
    item_id:=(finding->>'formulary_item_id')::uuid;
    select value into entry from jsonb_array_elements(p_items) where value->>'formulary_item_id'=item_id::text limit 1;
    signature:=md5(jsonb_build_object('formulary_item_id',item_id::text,'dose',trim_scale((entry->>'dose')::numeric)::text,'dose_unit',entry->>'dose_unit','frequency',entry->>'frequency','route',entry->>'route','quantity',trim_scale((entry->>'quantity')::numeric)::text)::text);
    severe:=finding->>'severity'='severe';
    insert into public.medication_safety_overrides(patient_id,formulary_item_id,finding_key,item_signature,finding,reason,prescriber_id,status)
      values(p_patient_id,item_id,finding->>'finding_key',signature,finding,btrim(p_reason),actor_id,case when severe then 'pending_second_approval' else 'approved' end);
    requested:=requested+1;
  end loop;
  if requested=0 then raise exception 'No requested finding key matched a current blocking finding'; end if;
  return jsonb_build_object('requested',requested,'awaiting_second_approval',exists(select 1 from public.medication_safety_overrides where prescriber_id=actor_id and patient_id=p_patient_id and status='pending_second_approval'));
end $$;
revoke all on function public.request_medication_safety_override(uuid,jsonb,text[],text) from public,anon;
grant execute on function public.request_medication_safety_override(uuid,jsonb,text[],text) to authenticated;

create or replace function public.approve_medication_safety_override(p_override_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare approver uuid;
begin
  select id into approver from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('doctor','specialist','super_admin') limit 1;
  if approver is null then raise exception 'Only an active clinician may approve a severe medication override'; end if;
  if public.mfa_required_for_current_user() and not public.has_aal2() then raise exception 'Multi-factor authentication is required for severe override approval'; end if;
  update public.medication_safety_overrides set status='approved',second_approver_id=approver,approved_at=now()
  where id=p_override_id and status='pending_second_approval' and prescriber_id<>approver;
  if not found then raise exception 'Override is unavailable or approver must be different from prescriber'; end if;
end $$;
revoke all on function public.approve_medication_safety_override(uuid) from public,anon;
grant execute on function public.approve_medication_safety_override(uuid) to authenticated;

create or replace function public.enforce_prescription_item_safety()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_patient uuid; actor_id uuid; payload jsonb; result jsonb; finding jsonb; signature text; override_id uuid; record_type text;
begin
  select patient_id into target_patient from public.prescriptions where id=new.prescription_id;
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  payload:=jsonb_build_array(jsonb_build_object('formulary_item_id',new.formulary_item_id,'dose',new.dose,'dose_unit',new.dose_unit,'frequency',new.frequency,'route',new.route,'quantity',new.quantity));
  result:=public.check_prescription(target_patient,payload);
  signature:=md5(jsonb_build_object('formulary_item_id',new.formulary_item_id::text,'dose',trim_scale(new.dose)::text,'dose_unit',new.dose_unit,'frequency',new.frequency,'route',new.route,'quantity',trim_scale(new.quantity)::text)::text);
  for finding in select value from jsonb_array_elements(result->'blocking') loop
    select id into override_id from public.medication_safety_overrides where patient_id=target_patient and formulary_item_id=new.formulary_item_id
      and finding_key=finding->>'finding_key' and item_signature=signature and prescriber_id=actor_id and status='approved'
      and (finding->>'severity'<>'severe' or (second_approver_id is not null and second_approver_id<>prescriber_id)) and used_at is null
      order by created_at desc limit 1 for update;
    if override_id is null then raise exception 'Medication safety check blocked this order: %',finding; end if;
    update public.medication_safety_overrides set status='used',used_at=now(),used_record_type='prescription_item',used_record_id=new.id where id=override_id;
    override_id:=null;
  end loop;
  return new;
end $$;
revoke all on function public.enforce_prescription_item_safety() from public,anon,authenticated;
drop trigger if exists enforce_prescription_item_safety on public.prescription_items;
create trigger enforce_prescription_item_safety before insert or update of formulary_item_id,dose,dose_unit,frequency,route,quantity on public.prescription_items
for each row execute function public.enforce_prescription_item_safety();

create or replace function public.enforce_medication_order_safety()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor_id uuid; payload jsonb; result jsonb; finding jsonb; signature text; override_id uuid;
begin
  if new.status not in ('active','draft') then return new; end if;
  if new.formulary_item_id is null then raise exception 'Medication order must select a formulary item'; end if;
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  payload:=jsonb_build_array(jsonb_build_object('formulary_item_id',new.formulary_item_id,'dose',new.dose,'dose_unit',new.dose_unit,'frequency',new.frequency,'route',new.route,'quantity',coalesce(new.dispense_quantity,1)));
  result:=public.check_prescription(new.patient_id,payload);
  signature:=md5(jsonb_build_object('formulary_item_id',new.formulary_item_id::text,'dose',trim_scale(new.dose::numeric)::text,'dose_unit',new.dose_unit,'frequency',new.frequency,'route',new.route,'quantity',trim_scale(coalesce(new.dispense_quantity,1))::text)::text);
  for finding in select value from jsonb_array_elements(result->'blocking') loop
    select id into override_id from public.medication_safety_overrides where patient_id=new.patient_id and formulary_item_id=new.formulary_item_id
      and finding_key=finding->>'finding_key' and item_signature=signature and prescriber_id=actor_id and status='approved'
      and (finding->>'severity'<>'severe' or (second_approver_id is not null and second_approver_id<>prescriber_id)) and used_at is null
      order by created_at desc limit 1 for update;
    if override_id is null then raise exception 'Medication safety check blocked this order: %',finding; end if;
    update public.medication_safety_overrides set status='used',used_at=now(),used_record_type='medication_order',used_record_id=new.id where id=override_id;
    override_id:=null;
  end loop;
  return new;
end $$;
revoke all on function public.enforce_medication_order_safety() from public,anon,authenticated;
drop trigger if exists enforce_medication_order_safety on public.medication_orders;
create trigger enforce_medication_order_safety before insert or update of patient_id,formulary_item_id,dose,dose_unit,frequency,route,dispense_quantity,status on public.medication_orders
for each row execute function public.enforce_medication_order_safety();

-- Rule authoring is service-role only. Authenticated users can read approved
-- rules and safety findings; none of the rule tables is pre-populated.
do $$ declare t text; begin
  foreach t in array array['allergen_classes','formulary_allergen_map','drug_interactions','dose_limits','patient_medication_risk_flags','medication_safety_overrides'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;
drop policy if exists "read approved medication safety rules" on public.allergen_classes;
create policy "read approved medication safety rules" on public.allergen_classes for select to authenticated using(active);
drop policy if exists "read approved medication allergy map" on public.formulary_allergen_map;
create policy "read approved medication allergy map" on public.formulary_allergen_map for select to authenticated using(approved);
drop policy if exists "read approved drug interactions" on public.drug_interactions;
create policy "read approved drug interactions" on public.drug_interactions for select to authenticated using(approved);
drop policy if exists "read approved dose limits" on public.dose_limits;
create policy "read approved dose limits" on public.dose_limits for select to authenticated using(approved);
drop policy if exists "clinical read patient medication risks" on public.patient_medication_risk_flags;
create policy "clinical read patient medication risks" on public.patient_medication_risk_flags for select to authenticated
  using(public.has_any_role(array['super_admin','doctor','specialist','pharmacist']) and public.can_access_patient(patient_id));
drop policy if exists "prescriber read medication overrides" on public.medication_safety_overrides;
create policy "prescriber read medication overrides" on public.medication_safety_overrides for select to authenticated
  using(public.has_any_role(array['super_admin','doctor','specialist']) and (prescriber_id=(select id from public.profiles where auth_user_id=auth.uid() limit 1) or second_approver_id=(select id from public.profiles where auth_user_id=auth.uid() limit 1)));

commit;
notify pgrst,'reload schema';
