begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

create table if not exists public.document_print_audit (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('prescription','discharge_summary','referral_letter','lab_report','radiology_report','invoice','receipt')),
  document_id uuid not null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  printed_at timestamptz not null default now()
);
create table if not exists public.patient_referral_letters (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
  destination text not null, reason text not null check(length(btrim(reason))>=5), clinical_summary text not null check(length(btrim(clinical_summary))>=5),
  authored_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now()
);
alter table public.patient_referral_letters enable row level security;
revoke all on public.patient_referral_letters from public,anon,authenticated;
drop trigger if exists audit_patient_referral_letters on public.patient_referral_letters;
create trigger audit_patient_referral_letters after insert or update or delete on public.patient_referral_letters
for each row execute function public.audit_row_change();
create index if not exists document_print_audit_patient_recent_idx on public.document_print_audit(patient_id,printed_at desc);
alter table public.document_print_audit enable row level security;
revoke all on public.document_print_audit from public,anon,authenticated;
drop trigger if exists audit_document_print_audit on public.document_print_audit;
create trigger audit_document_print_audit after insert on public.document_print_audit
for each row execute function public.audit_row_change();

create or replace function public.record_document_print(p_document_type text,p_document_id uuid,p_patient_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor_id uuid; valid_document boolean:=false; audit_id uuid;
begin
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null or not public.can_read_patient_record(p_patient_id) or not public.has_patient_facility_access(p_patient_id) then
    raise exception 'Document print access denied.';
  end if;
  case p_document_type
    when 'prescription' then select exists(select 1 from public.prescriptions where id=p_document_id and patient_id=p_patient_id) into valid_document;
    when 'discharge_summary' then select exists(select 1 from public.admissions where id=p_document_id and patient_id=p_patient_id and discharge_summary is not null) into valid_document;
    when 'lab_report' then select exists(select 1 from public.lab_orders where id=p_document_id and patient_id=p_patient_id) into valid_document;
    when 'radiology_report' then select exists(select 1 from public.radiology_orders where id=p_document_id and patient_id=p_patient_id) into valid_document;
    when 'invoice' then select exists(select 1 from public.billing where id=p_document_id and patient_id=p_patient_id) into valid_document;
    when 'receipt' then select exists(select 1 from public.payment_postings where id=p_document_id and patient_id=p_patient_id) into valid_document;
    when 'referral_letter' then select exists(select 1 from public.patient_referral_letters where id=p_document_id and patient_id=p_patient_id) into valid_document;
    else raise exception 'Unsupported document type.';
  end case;
  if not valid_document then raise exception 'The requested document does not exist for this patient.'; end if;
  insert into public.document_print_audit(document_type,document_id,patient_id,actor_id)
  values(p_document_type,p_document_id,p_patient_id,actor_id) returning id into audit_id;
  return audit_id;
end $$;
revoke all on function public.record_document_print(text,uuid,uuid) from public,anon;
grant execute on function public.record_document_print(text,uuid,uuid) to authenticated;

create or replace function public.create_patient_referral_letter(p_patient_id uuid,p_destination text,p_reason text,p_clinical_summary text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor_id uuid; letter_id uuid;
begin
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null or not public.has_org_permission('patient.read',(select home_facility_id from public.patients where id=p_patient_id),null)
    or not public.can_read_patient_record(p_patient_id) then raise exception 'Referral letter access denied.'; end if;
  if length(btrim(coalesce(p_destination,'')))<2 or length(btrim(coalesce(p_reason,'')))<5 or length(btrim(coalesce(p_clinical_summary,'')))<5 then raise exception 'Complete the destination, reason, and clinical summary.'; end if;
  insert into public.patient_referral_letters(patient_id,destination,reason,clinical_summary,authored_by)
  values(p_patient_id,btrim(p_destination),btrim(p_reason),btrim(p_clinical_summary),actor_id) returning id into letter_id;
  return letter_id;
end $$;
revoke all on function public.create_patient_referral_letter(uuid,text,text,text) from public,anon;
grant execute on function public.create_patient_referral_letter(uuid,text,text,text) to authenticated;

commit;
