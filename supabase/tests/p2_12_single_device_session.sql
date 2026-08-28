-- P2-12 disposable integration test. Run after all migrations in SQL Editor.
-- It proves that a restored older session cannot reclaim an account, while a
-- genuinely newer auth.sessions row can take over and revokes the old device.
begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
    if value is not true then raise exception 'P2-12 assertion failed: %', message; end if;
end;
$$;
grant execute on function pg_temp.assert_true(boolean, text) to authenticated;

insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
    '00000000-0000-0000-0000-000000000000', '21100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'p2-11@example.invalid', '', now(), '{}', '{}', now(), now()
);

insert into auth.sessions (id, user_id, created_at, updated_at) values
    ('21100000-0000-4000-8000-000000000101', '21100000-0000-4000-8000-000000000001', now() - interval '1 minute', now()),
    ('21100000-0000-4000-8000-000000000102', '21100000-0000-4000-8000-000000000001', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"21100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"21100000-0000-4000-8000-000000000101"}', true);

select pg_temp.assert_true(
    public.activate_single_device_session('21100000-0000-4000-8000-000000000011', false) ->> 'status' = 'active',
    'the first restored session should establish the lease'
);
select public.register_sync_device('21100000-0000-4000-8000-000000000011', 0);
select pg_temp.assert_true(
    (public.verify_single_device_session('21100000-0000-4000-8000-000000000011') ->> 'status') = 'active',
    'the matching session and device should verify'
);

-- A different device holding the same old persisted session cannot take over,
-- even if it sends the client-side takeover flag directly.
select pg_temp.assert_true(
    public.activate_single_device_session('21100000-0000-4000-8000-000000000012', true) ->> 'status' = 'displaced',
    'the same old auth session must not move to another device'
);

-- A new password login creates a newer auth.sessions row and may take over.
select set_config('request.jwt.claims', '{"sub":"21100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"21100000-0000-4000-8000-000000000102"}', true);
select pg_temp.assert_true(
    public.activate_single_device_session('21100000-0000-4000-8000-000000000012', true) ->> 'status' = 'active',
    'a genuinely newer explicit login should take over'
);
select public.register_sync_device('21100000-0000-4000-8000-000000000012', 0);
select pg_temp.assert_true(
    (select revoked_at is not null from public.sync_devices where id = '21100000-0000-4000-8000-000000000011'),
    'takeover must revoke the previous sync device'
);

-- Restoring the older JWT sees no account rows through RLS and cannot reclaim.
select set_config('request.jwt.claims', '{"sub":"21100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"21100000-0000-4000-8000-000000000101"}', true);
select pg_temp.assert_true(
    public.verify_single_device_session('21100000-0000-4000-8000-000000000011') ->> 'status' = 'displaced',
    'the previous session must remain displaced'
);
select pg_temp.assert_true(
    (select count(*) = 0 from public.datasets),
    'RLS must hide the dataset from the displaced session'
);
select pg_temp.assert_true(
    public.activate_single_device_session('21100000-0000-4000-8000-000000000011', true) ->> 'status' = 'displaced',
    'an older session cannot steal the account back by invoking the RPC'
);

reset role;
rollback;
