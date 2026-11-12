begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $$ begin
  if exists(select 1 from public.document_print_audit) then
    raise exception 'Rollback blocked: document print audit history exists and must be retained.';
  end if;
  if exists(select 1 from public.patient_referral_letters) then
    raise exception 'Rollback blocked: referral letters exist and must be retained.';
  end if;
end $$;
drop function if exists public.record_document_print(text,uuid,uuid);
drop function if exists public.create_patient_referral_letter(uuid,text,text,text);
drop table if exists public.patient_referral_letters;
drop table if exists public.document_print_audit;

commit;
