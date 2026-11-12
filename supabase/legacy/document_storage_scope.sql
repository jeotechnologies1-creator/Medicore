-- Align private patient document object access with the patient and
-- department-scoped metadata policies. Storage writes use the patient UUID as
-- the first folder segment: <patient UUID>/<random>-<filename>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-documents', 'patient-documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "department scope patient document reads" on storage.objects;
create policy "department scope patient document reads" on storage.objects
  as restrictive for select to authenticated using (
    bucket_id <> 'patient-documents'
    or exists (
      select 1 from public.patients patient
      where patient.id::text = (storage.foldername(name))[1]
        and public.has_clinical_department_permission(patient.id, null, 'patient.read', true)
    )
  );

drop policy if exists "department scope patient document uploads" on storage.objects;
create policy "department scope patient document uploads" on storage.objects
  as restrictive for insert to authenticated with check (
    bucket_id <> 'patient-documents'
    or exists (
      select 1 from public.patients patient
      where patient.id::text = (storage.foldername(name))[1]
        and public.has_clinical_department_permission(patient.id, null, 'document.manage', false)
    )
  );

drop policy if exists "department scope patient document deletes" on storage.objects;
create policy "department scope patient document deletes" on storage.objects
  as restrictive for delete to authenticated using (
    bucket_id <> 'patient-documents'
    or exists (
      select 1 from public.patients patient
      where patient.id::text = (storage.foldername(name))[1]
        and public.has_clinical_department_permission(patient.id, null, 'document.manage', false)
    )
  );
