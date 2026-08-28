-- P2-12: one active authenticated device per account.
-- Explicit sign-in may atomically take over; restoring an older persisted
-- session may only verify its lease and can never take it back implicitly.

create table public.account_active_sessions (
    owner_id uuid primary key references auth.users(id) on delete cascade,
    session_id uuid not null,
    session_created_at timestamptz not null,
    device_id uuid not null,
    claimed_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index account_active_sessions_device_idx
    on public.account_active_sessions(owner_id, device_id);

alter table public.account_active_sessions enable row level security;
revoke all on public.account_active_sessions from public, anon, authenticated;

create or replace function public.current_auth_session_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
    v_raw text := nullif((select auth.jwt() ->> 'session_id'), '');
begin
    if v_raw is null then return null; end if;
    return v_raw::uuid;
exception when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.current_auth_session_id() from public, anon, authenticated;

create or replace function public.is_active_account_session(p_device_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.account_active_sessions active
        where active.owner_id = (select auth.uid())
          and active.session_id = public.current_auth_session_id()
          and (p_device_id is null or active.device_id = p_device_id)
    );
$$;

revoke all on function public.is_active_account_session(uuid) from public, anon;
grant execute on function public.is_active_account_session(uuid) to authenticated;

create or replace function public.assert_active_account_session(p_device_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_active_account_session(p_device_id) then
        raise exception 'inactive account session';
    end if;
end;
$$;

revoke all on function public.assert_active_account_session(uuid) from public, anon, authenticated;

create or replace function public.activate_single_device_session(
    p_device_id uuid,
    p_allow_takeover boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_session uuid := public.current_auth_session_id();
    v_session_created_at timestamptz;
    v_existing public.account_active_sessions%rowtype;
    v_replaced boolean := false;
begin
    if v_owner is null or v_session is null then raise exception 'authentication required'; end if;
    if p_device_id is null then raise exception 'device id required'; end if;

    select created_at into v_session_created_at
    from auth.sessions
    where id = v_session and user_id = v_owner;
    if v_session_created_at is null then raise exception 'authenticated session not found'; end if;

    select * into v_existing
    from public.account_active_sessions
    where owner_id = v_owner
    for update;

    if not found then
        insert into public.account_active_sessions (owner_id, session_id, session_created_at, device_id)
        values (v_owner, v_session, v_session_created_at, p_device_id);
    elsif v_existing.session_id = v_session and v_existing.device_id = p_device_id then
        update public.account_active_sessions
        set last_seen_at = now()
        where owner_id = v_owner;
    elsif not p_allow_takeover or v_session_created_at <= v_existing.session_created_at then
        return jsonb_build_object('status', 'displaced', 'replacedDevice', false);
    else
        v_replaced := true;
        update public.account_active_sessions
        set session_id = v_session,
            session_created_at = v_session_created_at,
            device_id = p_device_id,
            claimed_at = now(),
            last_seen_at = now()
        where owner_id = v_owner;
    end if;

    -- Existing sync RPCs already reject revoked devices. Taking over therefore
    -- closes their mutation path immediately without changing persisted data.
    update public.sync_devices
    set revoked_at = case when id = p_device_id then null else coalesce(revoked_at, now()) end,
        updated_at = now()
    where owner_id = v_owner;

    -- Only the active device may retain a Web Push endpoint. Pending work for
    -- displaced endpoints is cancelled before the function returns.
    update public.push_subscriptions
    set revoked_at = coalesce(revoked_at, now()),
        updated_at = now()
    where owner_id = v_owner and device_id <> p_device_id;

    update public.reminder_deliveries delivery
    set state = 'cancelled', lease_token = null, lease_until = null, updated_at = now()
    from public.push_subscriptions subscription
    where delivery.subscription_id = subscription.id
      and subscription.owner_id = v_owner
      and subscription.device_id <> p_device_id
      and delivery.state in ('pending', 'leased');

    return jsonb_build_object('status', 'active', 'replacedDevice', v_replaced);
end;
$$;

create or replace function public.verify_single_device_session(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or public.current_auth_session_id() is null then
        raise exception 'authentication required';
    end if;
    if not public.is_active_account_session(p_device_id) then
        return jsonb_build_object('status', 'displaced', 'replacedDevice', false);
    end if;
    update public.account_active_sessions
    set last_seen_at = now()
    where owner_id = (select auth.uid());
    return jsonb_build_object('status', 'active', 'replacedDevice', false);
end;
$$;

revoke all on function public.activate_single_device_session(uuid, boolean) from public, anon;
revoke all on function public.verify_single_device_session(uuid) from public, anon;
grant execute on function public.activate_single_device_session(uuid, boolean) to authenticated;
grant execute on function public.verify_single_device_session(uuid) to authenticated;

-- Direct reads are also session-gated. Revoking only the old sync device would
-- otherwise still leave its JWT able to read account rows through owner RLS.
drop policy if exists "dataset owner may select" on public.datasets;
create policy "active session may select dataset" on public.datasets for select to authenticated
using ((select auth.uid()) = owner_id and public.is_active_account_session(null));

drop policy if exists "intent owner may select" on public.reconciliation_intents;
create policy "active session may select intent" on public.reconciliation_intents for select to authenticated
using ((select auth.uid()) = owner_id and public.is_active_account_session(null));

drop policy if exists "device owner may select" on public.sync_devices;
create policy "active session may select devices" on public.sync_devices for select to authenticated
using ((select auth.uid()) = owner_id and public.is_active_account_session(null));

drop policy if exists "record owner may select" on public.sync_records;
create policy "active session may select records" on public.sync_records for select to authenticated
using ((select auth.uid()) = owner_id and public.is_active_account_session(null));

drop policy if exists "receipt owner may select" on public.sync_mutation_receipts;
create policy "active session may select receipts" on public.sync_mutation_receipts for select to authenticated
using ((select auth.uid()) = owner_id and public.is_active_account_session(null));

drop policy if exists "conflict owner may select" on public.sync_conflicts;
create policy "active session may select conflicts" on public.sync_conflicts for select to authenticated
using ((select auth.uid()) = owner_id and public.is_active_account_session(null));

-- Registration is the one legacy RPC that could otherwise try to resurrect a
-- device. It now requires the exact active device lease before touching rows.
create or replace function public.register_sync_device(
    p_device_id uuid,
    p_last_observed_revision bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_dataset public.datasets%rowtype;
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    perform public.assert_active_account_session(p_device_id);
    if p_last_observed_revision < 0 then raise exception 'invalid revision'; end if;

    insert into public.datasets (owner_id) values (v_owner)
    on conflict (owner_id) do nothing;
    select * into v_dataset from public.datasets where owner_id = v_owner;

    insert into public.sync_devices (id, owner_id, dataset_id, last_observed_revision)
    values (p_device_id, v_owner, v_dataset.id, least(p_last_observed_revision, v_dataset.revision))
    on conflict (owner_id, id) do update
    set last_observed_revision = greatest(public.sync_devices.last_observed_revision, excluded.last_observed_revision),
        revoked_at = null,
        updated_at = now();

    return jsonb_build_object('datasetId', v_dataset.id, 'revision', v_dataset.revision);
end;
$$;

revoke all on function public.register_sync_device(uuid, bigint) from public, anon;
grant execute on function public.register_sync_device(uuid, bigint) to authenticated;

-- First-sign-in intent is also device-bound. An old restored session cannot
-- create or replace reconciliation state after another device takes over.
create or replace function public.prepare_first_sign_in_reconciliation(
    p_choice text,
    p_local_manifest jsonb,
    p_expected_remote_revision bigint default null,
    p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_dataset public.datasets%rowtype;
    v_intent_id uuid;
    v_account_manifest jsonb;
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    if p_device_id is null then raise exception 'device id required'; end if;
    perform public.assert_active_account_session(p_device_id);
    if p_choice not in ('start-empty', 'upload-local', 'download-account', 'merge-with-conflicts', 'keep-device-separate') then
        raise exception 'invalid reconciliation choice';
    end if;
    if jsonb_typeof(p_local_manifest) <> 'object' then raise exception 'invalid local manifest'; end if;

    select * into v_dataset from public.datasets where owner_id = v_owner for update;
    if not found then
        if p_expected_remote_revision is not null then raise exception 'remote revision changed'; end if;
        insert into public.datasets (owner_id) values (v_owner) returning * into v_dataset;
    elsif p_expected_remote_revision is distinct from v_dataset.revision then
        raise exception 'remote revision changed';
    end if;

    v_account_manifest := jsonb_build_object(
        'itemCount', v_dataset.item_count,
        'revision', v_dataset.revision,
        'digest', v_dataset.digest,
        'latestActivity', v_dataset.latest_activity,
        'counts', v_dataset.item_counts,
        'reconciliationStatus', v_dataset.reconciliation_status
    );

    insert into public.reconciliation_intents (
        owner_id, dataset_id, device_id, choice, local_manifest, account_manifest
    ) values (
        v_owner, v_dataset.id, p_device_id, p_choice, p_local_manifest, v_account_manifest
    ) returning id into v_intent_id;

    update public.datasets set reconciliation_status = 'prepared', updated_at = now()
    where id = v_dataset.id;
    return v_intent_id;
end;
$$;

revoke all on function public.prepare_first_sign_in_reconciliation(text, jsonb, bigint, uuid) from public, anon;
grant execute on function public.prepare_first_sign_in_reconciliation(text, jsonb, bigint, uuid) to authenticated;
