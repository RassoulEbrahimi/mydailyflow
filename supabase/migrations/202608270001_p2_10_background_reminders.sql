-- P2-10: server-backed, best-effort Web Push behind a default-OFF client flag.
-- Subscription capability URLs and encryption keys live encrypted in Vault.
-- Direct table access is denied; user RPCs derive owner_id from auth.uid().

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    device_id uuid not null,
    endpoint_hash text not null,
    secret_id uuid not null,
    timezone text not null,
    revoked_at timestamptz,
    failure_count integer not null default 0 check (failure_count >= 0),
    last_error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, device_id),
    unique (owner_id, endpoint_hash)
);

create table public.reminder_schedules (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    task_id text not null,
    local_date date not null,
    local_time time not null,
    timezone text not null,
    intended_at timestamptz not null,
    expires_at timestamptz not null,
    generation bigint not null default 1 check (generation > 0),
    state text not null default 'scheduled' check (state in ('scheduled','delivered','cancelled','expired')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, task_id),
    check (char_length(task_id) between 1 and 200),
    check (expires_at > intended_at)
);

create table public.reminder_deliveries (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    schedule_id uuid not null references public.reminder_schedules(id) on delete cascade,
    schedule_generation bigint not null check (schedule_generation > 0),
    subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
    state text not null default 'pending' check (state in ('pending','leased','delivered','cancelled','failed')),
    lease_token uuid,
    lease_until timestamptz,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    delivered_at timestamptz,
    last_error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (schedule_id, schedule_generation, subscription_id)
);

create index reminder_schedules_due_idx on public.reminder_schedules(intended_at)
where state = 'scheduled';
create index reminder_deliveries_claim_idx on public.reminder_deliveries(state, lease_until);
create index push_subscriptions_owner_active_idx on public.push_subscriptions(owner_id)
where revoked_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.reminder_schedules enable row level security;
alter table public.reminder_deliveries enable row level security;
revoke all on public.push_subscriptions, public.reminder_schedules, public.reminder_deliveries
from public, anon, authenticated;

create or replace function public.register_push_subscription(
    p_device_id uuid,
    p_timezone text,
    p_endpoint text,
    p_p256dh text,
    p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_existing public.push_subscriptions%rowtype;
    v_secret_id uuid;
    v_payload text;
    v_endpoint_hash text;
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    if not exists (
        select 1 from public.sync_devices
        where owner_id = v_owner and id = p_device_id and revoked_at is null
    ) then raise exception 'unknown or revoked device'; end if;
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
        raise exception 'invalid timezone';
    end if;
    if p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 2048 then
        raise exception 'invalid push endpoint';
    end if;
    if p_p256dh !~ '^[A-Za-z0-9_-]{40,200}$' or p_auth !~ '^[A-Za-z0-9_-]{8,100}$' then
        raise exception 'invalid push keys';
    end if;

    v_endpoint_hash := encode(extensions.digest(p_endpoint, 'sha256'), 'hex');
    v_payload := jsonb_build_object('endpoint', p_endpoint, 'keys', jsonb_build_object(
        'p256dh', p_p256dh, 'auth', p_auth
    ))::text;

    select * into v_existing from public.push_subscriptions
    where owner_id = v_owner and device_id = p_device_id for update;

    if found and v_existing.revoked_at is null then
        perform vault.update_secret(v_existing.secret_id, v_payload);
        v_secret_id := v_existing.secret_id;
    else
        v_secret_id := vault.create_secret(
            v_payload,
            'mdf_push_' || replace(v_owner::text, '-', '') || '_' || replace(p_device_id::text, '-', ''),
            'Encrypted My Daily Flow Web Push subscription'
        );
    end if;

    insert into public.push_subscriptions (
        owner_id, device_id, endpoint_hash, secret_id, timezone, revoked_at,
        failure_count, last_error_code
    ) values (
        v_owner, p_device_id, v_endpoint_hash, v_secret_id, p_timezone, null, 0, null
    ) on conflict (owner_id, device_id) do update
    set endpoint_hash = excluded.endpoint_hash,
        secret_id = excluded.secret_id,
        timezone = excluded.timezone,
        revoked_at = null,
        failure_count = 0,
        last_error_code = null,
        updated_at = now();

    insert into public.reminder_deliveries (
        owner_id, schedule_id, schedule_generation, subscription_id
    )
    select s.owner_id, s.id, s.generation, ps.id
    from public.reminder_schedules s
    join public.push_subscriptions ps on ps.owner_id = s.owner_id and ps.device_id = p_device_id
    where s.owner_id = v_owner and s.state = 'scheduled' and s.expires_at > now()
      and ps.revoked_at is null
    on conflict (schedule_id, schedule_generation, subscription_id) do nothing;

    return jsonb_build_object('status', 'registered');
end;
$$;

create or replace function public.revoke_push_subscription(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_subscription public.push_subscriptions%rowtype;
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    select * into v_subscription from public.push_subscriptions
    where owner_id = v_owner and device_id = p_device_id for update;
    if not found then return; end if;
    update public.push_subscriptions
    set revoked_at = now(), updated_at = now()
    where id = v_subscription.id;
    update public.reminder_deliveries
    set state = 'cancelled', lease_token = null, lease_until = null, updated_at = now()
    where subscription_id = v_subscription.id and state in ('pending','leased');
    delete from vault.secrets where id = v_subscription.secret_id;
end;
$$;

create or replace function public.reconcile_reminder_schedules(
    p_device_id uuid,
    p_timezone text,
    p_schedules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_item jsonb;
    v_task_id text;
    v_date date;
    v_time time;
    v_intended timestamptz;
    v_count integer;
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    if not exists (
        select 1 from public.sync_devices
        where owner_id = v_owner and id = p_device_id and revoked_at is null
    ) then raise exception 'unknown or revoked device'; end if;
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
        raise exception 'invalid timezone';
    end if;
    if p_schedules is null or jsonb_typeof(p_schedules) <> 'array'
       or jsonb_array_length(p_schedules) > 2000 then raise exception 'invalid schedules'; end if;

    -- Reconciliation replaces one account's complete active schedule set.
    -- Serialize concurrent device calls so cancellation-by-omission and
    -- generation changes are atomic for that account.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_owner::text));

    create temporary table if not exists pg_temp.mdf_reminder_input (
        task_id text primary key,
        local_date date not null,
        local_time time not null,
        intended_at timestamptz not null
    ) on commit drop;
    truncate pg_temp.mdf_reminder_input;

    for v_item in select value from jsonb_array_elements(p_schedules)
    loop
        if jsonb_typeof(v_item) <> 'object'
           or jsonb_typeof(v_item -> 'taskId') <> 'string'
           or jsonb_typeof(v_item -> 'date') <> 'string'
           or jsonb_typeof(v_item -> 'time') <> 'string' then
            raise exception 'invalid schedule item';
        end if;
        v_task_id := v_item ->> 'taskId';
        if char_length(v_task_id) not between 1 and 200
           or (v_item ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$'
           or (v_item ->> 'time') !~ '^(?:[01]\d|2[0-3]):[0-5]\d$' then
            raise exception 'invalid schedule fields';
        end if;
        begin
            v_date := (v_item ->> 'date')::date;
            v_time := (v_item ->> 'time')::time;
        exception when others then
            raise exception 'invalid schedule date or time';
        end;
        v_intended := (v_date + v_time) at time zone p_timezone - interval '10 minutes';
        insert into pg_temp.mdf_reminder_input values (v_task_id, v_date, v_time, v_intended);
    end loop;

    insert into public.reminder_schedules (
        owner_id, task_id, local_date, local_time, timezone, intended_at, expires_at
    )
    select v_owner, i.task_id, i.local_date, i.local_time, p_timezone,
           i.intended_at, i.intended_at + interval '15 minutes'
    from pg_temp.mdf_reminder_input i
    on conflict (owner_id, task_id) do update
    set local_date = excluded.local_date,
        local_time = excluded.local_time,
        timezone = excluded.timezone,
        intended_at = excluded.intended_at,
        expires_at = excluded.expires_at,
        generation = case
            when public.reminder_schedules.intended_at is distinct from excluded.intended_at
              or public.reminder_schedules.timezone is distinct from excluded.timezone
              or public.reminder_schedules.state in ('cancelled','expired')
            then public.reminder_schedules.generation + 1
            else public.reminder_schedules.generation
        end,
        state = case
            when public.reminder_schedules.intended_at is distinct from excluded.intended_at
              or public.reminder_schedules.timezone is distinct from excluded.timezone
              or public.reminder_schedules.state in ('cancelled','expired')
            then 'scheduled'
            else public.reminder_schedules.state
        end,
        updated_at = now();

    update public.reminder_schedules s
    set state = 'cancelled', generation = generation + 1, updated_at = now()
    where s.owner_id = v_owner and s.state <> 'cancelled'
      and not exists (select 1 from pg_temp.mdf_reminder_input i where i.task_id = s.task_id);

    update public.reminder_deliveries d
    set state = 'cancelled', lease_token = null, lease_until = null, updated_at = now()
    from public.reminder_schedules s
    where d.schedule_id = s.id and d.owner_id = v_owner
      and d.state in ('pending','leased')
      and (s.state <> 'scheduled' or d.schedule_generation <> s.generation);

    insert into public.reminder_deliveries (
        owner_id, schedule_id, schedule_generation, subscription_id
    )
    select s.owner_id, s.id, s.generation, ps.id
    from public.reminder_schedules s
    join public.push_subscriptions ps on ps.owner_id = s.owner_id and ps.revoked_at is null
    where s.owner_id = v_owner and s.state = 'scheduled' and s.expires_at > now()
    on conflict (schedule_id, schedule_generation, subscription_id) do nothing;

    select count(*)::integer into v_count from public.reminder_schedules
    where owner_id = v_owner and state = 'scheduled' and expires_at > now();
    return jsonb_build_object('activeCount', v_count);
end;
$$;

create or replace function public.claim_due_reminder_deliveries(
    p_limit integer default 100,
    p_lease_seconds integer default 45
)
returns table (
    delivery_id uuid,
    lease_token uuid,
    subscription jsonb,
    notification_tag text,
    expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Caller authorization is enforced by the EXECUTE grant below. Do not use
    -- current_user here: inside a SECURITY DEFINER function it is the function
    -- owner, not the invoking PostgREST role.
    if p_limit not between 1 and 500 or p_lease_seconds not between 10 and 300 then
        raise exception 'invalid claim limits';
    end if;

    update public.reminder_schedules set state = 'expired', updated_at = now()
    where state = 'scheduled' and expires_at <= now();
    update public.reminder_deliveries d set state = 'cancelled', updated_at = now()
    from public.reminder_schedules s
    where d.schedule_id = s.id and d.state in ('pending','leased') and s.state <> 'scheduled';

    return query
    with candidates as (
        select d.id
        from public.reminder_deliveries d
        join public.reminder_schedules s on s.id = d.schedule_id
        join public.push_subscriptions ps on ps.id = d.subscription_id
        where s.state = 'scheduled' and s.intended_at <= now() and s.expires_at > now()
          and ps.revoked_at is null
          and (d.state = 'pending' or (d.state = 'leased' and d.lease_until < now()))
        order by s.intended_at, d.id
        for update of d skip locked
        limit p_limit
    ), claimed as (
        update public.reminder_deliveries d
        set state = 'leased', lease_token = gen_random_uuid(),
            lease_until = now() + make_interval(secs => p_lease_seconds),
            attempt_count = d.attempt_count + 1, updated_at = now()
        from candidates c where d.id = c.id
        returning d.*
    )
    select c.id, c.lease_token, ds.decrypted_secret::jsonb,
           'mdf-reminder-' || c.schedule_id::text || '-' || c.schedule_generation::text,
           s.expires_at
    from claimed c
    join public.reminder_schedules s on s.id = c.schedule_id
    join public.push_subscriptions ps on ps.id = c.subscription_id
    join vault.decrypted_secrets ds on ds.id = ps.secret_id;
end;
$$;

create or replace function public.complete_reminder_delivery(
    p_delivery_id uuid,
    p_lease_token uuid,
    p_outcome text,
    p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_delivery public.reminder_deliveries%rowtype;
    v_subscription public.push_subscriptions%rowtype;
    v_expires timestamptz;
begin
    -- Caller authorization is enforced by the service_role-only EXECUTE grant.
    if p_outcome not in ('sent','retry','expired-subscription') then raise exception 'invalid delivery outcome'; end if;
    select d.* into v_delivery
    from public.reminder_deliveries d
    where d.id = p_delivery_id
    for update;
    if not found or v_delivery.state <> 'leased' or v_delivery.lease_token <> p_lease_token then
        raise exception 'invalid or stale lease';
    end if;
    select s.expires_at into strict v_expires
    from public.reminder_schedules s
    where s.id = v_delivery.schedule_id;

    if p_outcome = 'sent' then
        update public.reminder_deliveries set state = 'delivered', delivered_at = now(),
            lease_token = null, lease_until = null, last_error_code = null, updated_at = now()
        where id = p_delivery_id;
    elsif p_outcome = 'retry' and v_delivery.attempt_count < 5 and v_expires > now() then
        update public.reminder_deliveries set state = 'pending', lease_token = null,
            lease_until = null, last_error_code = left(coalesce(p_error_code, 'retry'), 80), updated_at = now()
        where id = p_delivery_id;
    else
        update public.reminder_deliveries set state = 'failed', lease_token = null,
            lease_until = null, last_error_code = left(coalesce(p_error_code, p_outcome), 80), updated_at = now()
        where id = p_delivery_id;
        select * into v_subscription from public.push_subscriptions where id = v_delivery.subscription_id for update;
        update public.push_subscriptions set failure_count = failure_count + 1,
            last_error_code = left(coalesce(p_error_code, p_outcome), 80),
            revoked_at = case when p_outcome = 'expired-subscription' then now() else revoked_at end,
            updated_at = now()
        where id = v_delivery.subscription_id;
        if p_outcome = 'expired-subscription' then
            update public.reminder_deliveries set state = 'cancelled', updated_at = now()
            where subscription_id = v_delivery.subscription_id and state in ('pending','leased');
            delete from vault.secrets where id = v_subscription.secret_id;
        end if;
    end if;

    -- Finish the occurrence only after every per-device delivery is terminal.
    -- A single successful device makes the occurrence delivered; if every
    -- device failed or was cancelled, it is expired rather than left forever
    -- in the scheduled state.
    if not exists (
        select 1 from public.reminder_deliveries
        where schedule_id = v_delivery.schedule_id
          and schedule_generation = v_delivery.schedule_generation
          and state in ('pending','leased')
    ) then
        update public.reminder_schedules
        set state = case when exists (
                select 1 from public.reminder_deliveries
                where schedule_id = v_delivery.schedule_id
                  and schedule_generation = v_delivery.schedule_generation
                  and state = 'delivered'
            ) then 'delivered' else 'expired' end,
            updated_at = now()
        where id = v_delivery.schedule_id
          and generation = v_delivery.schedule_generation
          and state = 'scheduled';
    end if;
end;
$$;

revoke all on function public.register_push_subscription(uuid, text, text, text, text) from public, anon;
revoke all on function public.revoke_push_subscription(uuid) from public, anon;
revoke all on function public.reconcile_reminder_schedules(uuid, text, jsonb) from public, anon;
grant execute on function public.register_push_subscription(uuid, text, text, text, text) to authenticated;
grant execute on function public.revoke_push_subscription(uuid) to authenticated;
grant execute on function public.reconcile_reminder_schedules(uuid, text, jsonb) to authenticated;

revoke all on function public.claim_due_reminder_deliveries(integer, integer) from public, anon, authenticated;
revoke all on function public.complete_reminder_delivery(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_due_reminder_deliveries(integer, integer) to service_role;
grant execute on function public.complete_reminder_delivery(uuid, uuid, text, text) to service_role;
