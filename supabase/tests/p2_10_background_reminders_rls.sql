-- P2-10 disposable integration test. Run after P2-8, P2-9 and P2-10 migrations.
-- Synthetic users, Vault entries and reminder rows are all rolled back.
begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
    if value is not true then raise exception 'P2-10 assertion failed: %', message; end if;
end;
$$;
grant execute on function pg_temp.assert_true(boolean, text) to authenticated;

insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
    ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000001',
     'authenticated', 'authenticated', 'p2-10-a@example.invalid', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000002',
     'authenticated', 'authenticated', 'p2-10-b@example.invalid', '', now(), '{}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select public.register_sync_device('21000000-0000-4000-8000-000000000011', 0);

select pg_temp.assert_true(
    not has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT'),
    'subscription capability rows must not be readable directly'
);
select pg_temp.assert_true(
    not has_table_privilege('authenticated', 'public.reminder_schedules', 'INSERT'),
    'schedule rows must not be writable directly'
);

select public.register_push_subscription(
    '21000000-0000-4000-8000-000000000011', 'Europe/Berlin',
    'https://push.example.invalid/synthetic-capability',
    repeat('A', 80), repeat('B', 24)
);
select pg_temp.assert_true(
    public.reconcile_reminder_schedules(
        '21000000-0000-4000-8000-000000000011', 'Europe/Berlin',
        '[{"taskId":"synthetic-task","date":"2099-08-28","time":"09:30"}]'
    ) ->> 'activeCount' = '1',
    'future schedule should be active'
);

-- The authenticated role deliberately has no direct table access. Inspect
-- server-owned rows as postgres, then return to the synthetic caller.
reset role;
select pg_temp.assert_true(
    (select count(*) = 1 from public.reminder_schedules where task_id = 'synthetic-task'),
    'idempotent reconcile should create one schedule'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select public.reconcile_reminder_schedules(
    '21000000-0000-4000-8000-000000000011', 'Europe/Berlin',
    '[{"taskId":"synthetic-task","date":"2099-08-28","time":"09:30"}]'
);
reset role;
select pg_temp.assert_true(
    (select generation = 1 from public.reminder_schedules where task_id = 'synthetic-task'),
    'unchanged reconcile must preserve generation'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select public.reconcile_reminder_schedules(
    '21000000-0000-4000-8000-000000000011', 'Europe/Berlin', '[]'
);
reset role;
select pg_temp.assert_true(
    (select state = 'cancelled' from public.reminder_schedules where task_id = 'synthetic-task'),
    'omission must cancel completion/edit/delete schedules'
);

-- A different account cannot reuse another account's registered device.
set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000002', true);
do $$
begin
    perform public.reconcile_reminder_schedules(
        '21000000-0000-4000-8000-000000000011', 'Europe/Berlin', '[]'
    );
    raise exception 'cross-account device unexpectedly accepted';
exception when others then
    if sqlerrm = 'cross-account device unexpectedly accepted' then raise; end if;
end;
$$;

reset role;
rollback;
