begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.backup_status (
  singleton boolean primary key default true check(singleton),
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.backup_status enable row level security;
revoke all on public.backup_status from public,anon,authenticated;
grant select,insert,update on public.backup_status to service_role;
insert into public.backup_status(singleton,last_success_at) values(true,null);

commit;
