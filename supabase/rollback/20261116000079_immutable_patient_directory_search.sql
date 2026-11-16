begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create or replace function public.search_patient_directory(p_query text default '',p_offset integer default 0,p_limit integer default 100)
returns setof public.patients language plpgsql security definer set search_path=public as $$
declare p public.patients%rowtype; actor_id uuid; search_text text:=lower(btrim(coalesce(p_query,'')));
begin
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
  if actor_id is null then raise exception 'Patient directory access denied'; end if;
  if p_offset<0 or p_limit not between 1 and 250 then raise exception 'Invalid directory page'; end if;
  for p in select x.* from public.patients x where (search_text='' or lower(concat_ws(' ',x.first_name,x.last_name,x.patient_number,x.medical_record_number,x.phone)) like '%'||search_text||'%')
    and public.can_read_patient_record(x.id) and public.has_patient_facility_access(x.id)
    order by x.last_name,x.first_name,x.id offset p_offset limit p_limit loop
    insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(p.id,auth.uid(),'search_result','patient_directory','search_patient_directory');
    return next p;
  end loop;
end $$;
revoke all on function public.search_patient_directory(text,integer,integer) from public,anon;
grant execute on function public.search_patient_directory(text,integer,integer) to authenticated;
commit;
