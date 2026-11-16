begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $$ declare existing_job bigint; begin
  if to_regclass('cron.job') is not null then
    for existing_job in select jobid from cron.job where jobname in ('critical-result-escalation','notification-dispatch','integration-dispatch') loop
      perform cron.unschedule(existing_job);
    end loop;
  end if;
exception when undefined_table or undefined_function or insufficient_privilege then null;
end $$;

drop function if exists public.list_critical_result_delivery_status();
drop trigger if exists zz_notify_critical_lab_result on public.lab_orders;
drop trigger if exists zz_notify_critical_radiology_result on public.radiology_orders;

commit;
