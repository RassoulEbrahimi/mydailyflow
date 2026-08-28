-- P2-9 disposable integration test. Run after the migration in SQL Editor.
-- Every synthetic user and row is rolled back, including the helper function.
begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
    if value is not true then raise exception 'P2-9 assertion failed: %', message; end if;
end;
$$;
grant execute on function pg_temp.assert_true(boolean, text) to authenticated;

insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
    ('00000000-0000-0000-0000-000000000000', '29000000-0000-4000-8000-000000000001',
     'authenticated', 'authenticated', 'p2-9-a@example.invalid', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '29000000-0000-4000-8000-000000000002',
     'authenticated', 'authenticated', 'p2-9-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at) values
    ('29000000-0000-4000-8000-000000000101', '29000000-0000-4000-8000-000000000001', now(), now()),
    ('29000000-0000-4000-8000-000000000102', '29000000-0000-4000-8000-000000000002', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"29000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"29000000-0000-4000-8000-000000000101"}', true);

select public.activate_single_device_session('29000000-0000-4000-8000-000000000011', false);
select public.register_sync_device('29000000-0000-4000-8000-000000000011', 0);
select pg_temp.assert_true(
    not has_table_privilege('authenticated', 'public.sync_records', 'INSERT'),
    'authenticated must not write sync_records directly'
);

-- Initial record, then two devices edit independent fields from revision 1.
select pg_temp.assert_true(
    public.apply_sync_mutation(
        '29000000-0000-4000-8000-000000000021', '29000000-0000-4000-8000-000000000011',
        'task:p2-9-test', 'task', 0, 'patch', '{"title":"Initial","priority":"medium"}', '{}'
    ) ->> 'status' = 'applied',
    'initial mutation should apply'
);
select pg_temp.assert_true(
    public.apply_sync_mutation(
        '29000000-0000-4000-8000-000000000022', '29000000-0000-4000-8000-000000000011',
        'task:p2-9-test', 'task', 1, 'patch', '{"title":"Device A"}', '{}'
    ) ->> 'status' = 'applied',
    'first independent edit should apply'
);
select pg_temp.assert_true(
    public.apply_sync_mutation(
        '29000000-0000-4000-8000-000000000023', '29000000-0000-4000-8000-000000000011',
        'task:p2-9-test', 'task', 1, 'patch', '{"priority":"high"}', '{}'
    ) ->> 'status' = 'applied',
    'second independent edit should merge'
);
select pg_temp.assert_true(
    (select payload = '{"title":"Device A","priority":"high"}'::jsonb
     from public.sync_records where entity_key = 'task:p2-9-test'),
    'independent fields must both survive'
);

-- Removing a field is explicit and idempotent replay never advances revision.
select pg_temp.assert_true(
    public.apply_sync_mutation(
        '29000000-0000-4000-8000-000000000024', '29000000-0000-4000-8000-000000000011',
        'task:p2-9-test', 'task', 3, 'patch', '{}', array['priority']
    ) ->> 'status' = 'applied',
    'field removal should apply'
);
select pg_temp.assert_true(
    not (select payload ? 'priority' from public.sync_records where entity_key = 'task:p2-9-test'),
    'removed field must disappear from canonical payload'
);
select pg_temp.assert_true(
    (public.apply_sync_mutation(
        '29000000-0000-4000-8000-000000000024', '29000000-0000-4000-8000-000000000011',
        'task:p2-9-test', 'task', 3, 'patch', '{}', array['priority']
    ) ->> 'revision')::bigint = 4,
    'replayed mutation must return its original revision'
);

-- A stale same-field edit creates a visible conflict and leaves server data intact.
select pg_temp.assert_true(
    public.apply_sync_mutation(
        '29000000-0000-4000-8000-000000000025', '29000000-0000-4000-8000-000000000011',
        'task:p2-9-test', 'task', 1, 'patch', '{"title":"Device B"}', '{}'
    ) ->> 'status' = 'conflict',
    'same-field stale edit must conflict'
);
select pg_temp.assert_true(
    (select payload ->> 'title' = 'Device A' from public.sync_records where entity_key = 'task:p2-9-test'),
    'conflict must not overwrite the server value'
);
select public.resolve_sync_conflict(
    (select id from public.sync_conflicts where mutation_id = '29000000-0000-4000-8000-000000000025'),
    'use-device', '29000000-0000-4000-8000-000000000011', true,
    '{"title":"Current device value","notes":"kept as a whole record"}'
);
select pg_temp.assert_true(
    (select payload = '{"title":"Current device value","notes":"kept as a whole record"}'::jsonb
     from public.sync_records where entity_key = 'task:p2-9-test'),
    'use-device resolution must use the current full device record'
);

-- A second authenticated user cannot see the first account's rows through RLS.
select set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"29000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"29000000-0000-4000-8000-000000000102"}', true);
select public.activate_single_device_session('29000000-0000-4000-8000-000000000013', false);
select public.register_sync_device('29000000-0000-4000-8000-000000000013', 0);
select pg_temp.assert_true(
    (select count(*) = 0 from public.sync_records),
    'RLS must hide another account records'
);
select pg_temp.assert_true(
    position('owner' in lower(pg_get_function_arguments(
        'public.apply_sync_mutation(uuid,uuid,text,text,bigint,text,jsonb,text[],timestamp with time zone)'::regprocedure
    ))) = 0,
    'mutation RPC must not accept an owner id'
);

reset role;
rollback;
