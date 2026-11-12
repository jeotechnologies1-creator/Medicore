begin;
select plan(11);

select has_table('public','reference_ranges','lab interpretation ranges are stored centrally');
select has_table('public','result_ack_deadlines','result acknowledgement deadlines are configurable');
select has_table('public','result_escalation_ladder','result escalation recipients and timing are configurable');
select has_table('public','outbound_messages','outbound messages have a durable delivery queue');
select has_table('public','result_escalation_log','every escalation step is auditable');
select has_column('public','result_acknowledgements','read_back_confirmed','critical results record read-back confirmation');
select has_column('public','result_acknowledgements','acknowledgement_method','acknowledgements record how the result was communicated');
select has_function('public','queue_result_acknowledgement',array[]::text[],'lab and radiology results use the configurable deadline trigger');
select has_function('public','escalate_overdue_results',array[]::text[],'the escalation worker advances one recipient step per pass');
select is((select deadline_minutes from public.result_ack_deadlines where severity='critical'),30,'critical acknowledgement default is 30 minutes');
select is((select deadline_minutes from public.result_ack_deadlines where severity='urgent'),240,'urgent acknowledgement default is four hours');
select * from finish();
rollback;
