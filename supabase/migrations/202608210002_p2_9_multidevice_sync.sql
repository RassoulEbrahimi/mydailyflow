-- P2-9: account-owned local-first synchronization with ordered revisions,
-- idempotent mutation receipts, tombstones and explicit conflict records.

alter table public.datasets drop constraint if exists datasets_reconciliation_status_check;
alter table public.datasets add constraint datasets_reconciliation_status_check
    check (reconciliation_status in ('none', 'prepared', 'active'));

create table public.sync_devices (
    id uuid not null,
    owner_id uuid not null references auth.users(id) on delete cascade,
    dataset_id uuid not null references public.datasets(id) on delete cascade,
    last_observed_revision bigint not null default 0 check (last_observed_revision >= 0),
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (owner_id, id)
);

create table public.sync_records (
    owner_id uuid not null references auth.users(id) on delete cascade,
    dataset_id uuid not null references public.datasets(id) on delete cascade,
    entity_key text not null,
    kind text not null check (kind in (
        'task', 'essential', 'essential-progress', 'essential-history',
        'focus-active', 'focus-session', 'template', 'preference'
    )),
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    field_revisions jsonb not null default '{}'::jsonb check (jsonb_typeof(field_revisions) = 'object'),
    revision bigint not null check (revision > 0),
    tombstone boolean not null default false,
    tombstoned_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (owner_id, entity_key)
);

create table public.sync_mutation_receipts (
    owner_id uuid not null references auth.users(id) on delete cascade,
    mutation_id uuid not null,
    dataset_id uuid not null references public.datasets(id) on delete cascade,
    device_id uuid not null,
    entity_key text not null,
    base_revision bigint not null check (base_revision >= 0),
    applied_revision bigint not null check (applied_revision >= 0),
    status text not null check (status in ('applied', 'conflict')),
    conflict_id uuid,
    created_at timestamptz not null default now(),
    primary key (owner_id, mutation_id)
);

create table public.sync_conflicts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    dataset_id uuid not null references public.datasets(id) on delete cascade,
    mutation_id uuid not null,
    device_id uuid not null,
    entity_key text not null,
    kind text not null,
    reason text not null check (reason in ('same-field-edit', 'edit-after-delete', 'delete-after-edit')),
    conflicting_fields text[] not null default '{}',
    server_payload jsonb not null default '{}'::jsonb,
    client_changes jsonb not null default '{}'::jsonb,
    client_removed_fields text[] not null default '{}',
    client_operation text not null check (client_operation in ('patch', 'delete')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolution text check (resolution in ('keep-server', 'use-device')),
    unique (owner_id, mutation_id)
);

alter table public.sync_mutation_receipts
    add constraint sync_receipts_conflict_id_fkey
    foreign key (conflict_id) references public.sync_conflicts(id) on delete set null;

create index sync_devices_owner_idx on public.sync_devices(owner_id);
create index sync_records_owner_revision_idx on public.sync_records(owner_id, revision);
create index sync_receipts_owner_idx on public.sync_mutation_receipts(owner_id);
create index sync_conflicts_owner_open_idx on public.sync_conflicts(owner_id, resolved_at) where resolved_at is null;

alter table public.sync_devices enable row level security;
alter table public.sync_records enable row level security;
alter table public.sync_mutation_receipts enable row level security;
alter table public.sync_conflicts enable row level security;

revoke all on public.sync_devices, public.sync_records, public.sync_mutation_receipts, public.sync_conflicts from anon, authenticated;
grant select on public.sync_devices, public.sync_records, public.sync_mutation_receipts, public.sync_conflicts to authenticated;
grant select on public.reconciliation_intents to authenticated;

create policy "device owner may select" on public.sync_devices for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "record owner may select" on public.sync_records for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "receipt owner may select" on public.sync_mutation_receipts for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "conflict owner may select" on public.sync_conflicts for select to authenticated
using ((select auth.uid()) = owner_id);

create or replace function public.recalculate_sync_manifest(p_owner uuid, p_dataset uuid)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.datasets d
    set item_count = summary.item_count,
        item_counts = summary.item_counts,
        digest = summary.digest,
        latest_activity = now(),
        reconciliation_status = 'active',
        updated_at = now()
    from (
        select
            count(*) filter (where not r.tombstone)::integer as item_count,
            jsonb_build_object(
                'tasks', count(*) filter (where not r.tombstone and r.kind = 'task'),
                'essentials', count(*) filter (where not r.tombstone and r.kind = 'essential'),
                'essentialHistoryDays', count(*) filter (where not r.tombstone and r.kind = 'essential-history'),
                'focusSessions', count(*) filter (where not r.tombstone and r.kind = 'focus-session'),
                'templates', count(*) filter (where not r.tombstone and r.kind = 'template')
            ) as item_counts,
            md5(coalesce(string_agg(r.entity_key || ':' || r.revision::text || ':' || r.tombstone::text, ',' order by r.entity_key), '')) as digest
        from public.sync_records r
        where r.owner_id = p_owner and r.dataset_id = p_dataset
    ) summary
    where d.id = p_dataset and d.owner_id = p_owner;
$$;

revoke all on function public.recalculate_sync_manifest(uuid, uuid) from public, anon, authenticated;

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
    if p_last_observed_revision < 0 then raise exception 'invalid revision'; end if;

    insert into public.datasets (owner_id) values (v_owner)
    on conflict (owner_id) do nothing;
    select * into v_dataset from public.datasets where owner_id = v_owner;

    insert into public.sync_devices (id, owner_id, dataset_id, last_observed_revision)
    values (p_device_id, v_owner, v_dataset.id, least(p_last_observed_revision, v_dataset.revision))
    on conflict (owner_id, id) do update
    set last_observed_revision = greatest(public.sync_devices.last_observed_revision, excluded.last_observed_revision),
        updated_at = now()
    where public.sync_devices.revoked_at is null;

    if not exists (select 1 from public.sync_devices where owner_id = v_owner and id = p_device_id and revoked_at is null) then
        raise exception 'device revoked';
    end if;
    return jsonb_build_object('datasetId', v_dataset.id, 'revision', v_dataset.revision);
end;
$$;

create or replace function public.apply_sync_mutation(
    p_mutation_id uuid,
    p_device_id uuid,
    p_entity_key text,
    p_kind text,
    p_base_revision bigint,
    p_operation text,
    p_changes jsonb default '{}'::jsonb,
    p_removed_fields text[] default '{}',
    p_client_timestamp timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_dataset public.datasets%rowtype;
    v_record public.sync_records%rowtype;
    v_receipt public.sync_mutation_receipts%rowtype;
    v_revision bigint;
    v_conflict_id uuid;
    v_conflicting text[] := '{}';
    v_field_revisions jsonb := '{}'::jsonb;
    v_reason text;
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    if p_entity_key !~ '^[a-z][a-z0-9-]*:.+$' or length(p_entity_key) > 240 then raise exception 'invalid entity key'; end if;
    if p_kind not in ('task','essential','essential-progress','essential-history','focus-active','focus-session','template','preference') then raise exception 'invalid kind'; end if;
    if p_operation not in ('patch','delete') then raise exception 'invalid operation'; end if;
    if p_base_revision < 0 then raise exception 'invalid base revision'; end if;
    if p_operation = 'patch' and (p_changes is null or jsonb_typeof(p_changes) <> 'object'
        or (p_changes = '{}'::jsonb and cardinality(coalesce(p_removed_fields, '{}')) = 0)) then raise exception 'invalid changes'; end if;
    if exists (
        select 1 from unnest(coalesce(p_removed_fields, '{}')) field
        where field = '' or length(field) > 120
    ) then raise exception 'invalid removed field'; end if;
    if exists (
        select 1 from unnest(coalesce(p_removed_fields, '{}')) field
        where p_changes ? field
    ) then raise exception 'field cannot be changed and removed'; end if;
    if pg_column_size(p_changes) > 1048576 then raise exception 'mutation too large'; end if;

    select * into v_receipt from public.sync_mutation_receipts
    where owner_id = v_owner and mutation_id = p_mutation_id;
    if found then
        return jsonb_build_object('mutationId', v_receipt.mutation_id, 'status', v_receipt.status,
            'revision', v_receipt.applied_revision, 'conflictId', v_receipt.conflict_id);
    end if;

    select * into v_dataset from public.datasets where owner_id = v_owner for update;
    if not found then raise exception 'dataset not prepared'; end if;
    if not exists (select 1 from public.sync_devices where owner_id = v_owner and dataset_id = v_dataset.id and id = p_device_id and revoked_at is null) then
        raise exception 'unknown or revoked device';
    end if;

    select * into v_record from public.sync_records
    where owner_id = v_owner and dataset_id = v_dataset.id and entity_key = p_entity_key;

    if p_operation = 'delete' and found and v_record.revision > p_base_revision then
        v_reason := 'delete-after-edit';
    elsif p_operation = 'patch' and found and v_record.tombstone and v_record.revision > p_base_revision then
        v_reason := 'edit-after-delete';
    elsif p_operation = 'patch' and found then
        select coalesce(array_agg(field order by field), '{}') into v_conflicting
        from unnest(
            array(select jsonb_object_keys(p_changes)) || coalesce(p_removed_fields, '{}')
        ) field
        where coalesce((v_record.field_revisions ->> field)::bigint, 0) > p_base_revision;
        if cardinality(v_conflicting) > 0 then v_reason := 'same-field-edit'; end if;
    end if;

    if v_reason is not null then
        insert into public.sync_conflicts (
            owner_id, dataset_id, mutation_id, device_id, entity_key, kind, reason,
            conflicting_fields, server_payload, client_changes, client_removed_fields, client_operation
        ) values (
            v_owner, v_dataset.id, p_mutation_id, p_device_id, p_entity_key, p_kind, v_reason,
            v_conflicting, coalesce(v_record.payload, '{}'::jsonb), p_changes, coalesce(p_removed_fields, '{}'), p_operation
        ) returning id into v_conflict_id;
        insert into public.sync_mutation_receipts (
            owner_id, mutation_id, dataset_id, device_id, entity_key, base_revision,
            applied_revision, status, conflict_id
        ) values (v_owner, p_mutation_id, v_dataset.id, p_device_id, p_entity_key,
            p_base_revision, v_dataset.revision, 'conflict', v_conflict_id);
        return jsonb_build_object('mutationId', p_mutation_id, 'status', 'conflict',
            'revision', v_dataset.revision, 'conflictId', v_conflict_id);
    end if;

    v_revision := v_dataset.revision + 1;
    if p_operation = 'delete' then
        insert into public.sync_records (
            owner_id, dataset_id, entity_key, kind, payload, field_revisions,
            revision, tombstone, tombstoned_at
        ) values (
            v_owner, v_dataset.id, p_entity_key, p_kind,
            coalesce(v_record.payload, '{}'::jsonb), coalesce(v_record.field_revisions, '{}'::jsonb),
            v_revision, true, now()
        ) on conflict (owner_id, entity_key) do update
        set revision = excluded.revision, tombstone = true, tombstoned_at = now(), updated_at = now();
    else
        select coalesce(jsonb_object_agg(field, to_jsonb(v_revision)), '{}'::jsonb)
        into v_field_revisions from unnest(
            array(select jsonb_object_keys(p_changes)) || coalesce(p_removed_fields, '{}')
        ) field;
        insert into public.sync_records (
            owner_id, dataset_id, entity_key, kind, payload, field_revisions, revision, tombstone
        ) values (
            v_owner, v_dataset.id, p_entity_key, p_kind, p_changes, v_field_revisions, v_revision, false
        ) on conflict (owner_id, entity_key) do update
        set kind = excluded.kind,
            payload = (public.sync_records.payload || excluded.payload) - coalesce(p_removed_fields, '{}'),
            field_revisions = public.sync_records.field_revisions || excluded.field_revisions,
            revision = excluded.revision, tombstone = false, tombstoned_at = null, updated_at = now();
    end if;

    update public.datasets set revision = v_revision, updated_at = now() where id = v_dataset.id;
    perform public.recalculate_sync_manifest(v_owner, v_dataset.id);
    insert into public.sync_mutation_receipts (
        owner_id, mutation_id, dataset_id, device_id, entity_key, base_revision,
        applied_revision, status
    ) values (v_owner, p_mutation_id, v_dataset.id, p_device_id, p_entity_key,
        p_base_revision, v_revision, 'applied');
    return jsonb_build_object('mutationId', p_mutation_id, 'status', 'applied',
        'revision', v_revision, 'conflictId', null);
end;
$$;

create or replace function public.resolve_sync_conflict(
    p_conflict_id uuid,
    p_resolution text,
    p_device_id uuid,
    p_device_present boolean,
    p_device_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner uuid := (select auth.uid());
    v_conflict public.sync_conflicts%rowtype;
    v_dataset public.datasets%rowtype;
    v_record public.sync_records%rowtype;
    v_revision bigint;
    v_field_revisions jsonb;
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    if p_resolution not in ('keep-server','use-device') then raise exception 'invalid resolution'; end if;
    if p_device_present is null then raise exception 'invalid device presence'; end if;
    if p_resolution = 'use-device' and p_device_present
        and (p_device_payload is null or jsonb_typeof(p_device_payload) <> 'object' or pg_column_size(p_device_payload) > 1048576)
    then raise exception 'invalid device payload'; end if;
    if not exists (select 1 from public.sync_devices where owner_id = v_owner and id = p_device_id and revoked_at is null) then raise exception 'unknown or revoked device'; end if;
    select * into v_conflict from public.sync_conflicts where owner_id = v_owner and id = p_conflict_id for update;
    if not found then raise exception 'conflict not found'; end if;
    if v_conflict.resolved_at is not null then
        return jsonb_build_object('status','resolved','revision',(select revision from public.datasets where id = v_conflict.dataset_id));
    end if;
    select * into v_dataset from public.datasets where owner_id = v_owner and id = v_conflict.dataset_id for update;
    v_revision := v_dataset.revision;

    if p_resolution = 'use-device' then
        v_revision := v_revision + 1;
        select * into v_record from public.sync_records where owner_id = v_owner and entity_key = v_conflict.entity_key;
        if not p_device_present then
            insert into public.sync_records (
                owner_id, dataset_id, entity_key, kind, payload, field_revisions,
                revision, tombstone, tombstoned_at
            ) values (
                v_owner, v_dataset.id, v_conflict.entity_key, v_conflict.kind,
                coalesce(v_record.payload, '{}'::jsonb), coalesce(v_record.field_revisions, '{}'::jsonb),
                v_revision, true, now()
            ) on conflict (owner_id, entity_key) do update
            set revision = excluded.revision, tombstone = true,
                tombstoned_at = now(), updated_at = now();
        else
            select coalesce(jsonb_object_agg(field, to_jsonb(v_revision)), '{}'::jsonb)
            into v_field_revisions from jsonb_object_keys(p_device_payload) field;
            insert into public.sync_records (
                owner_id, dataset_id, entity_key, kind, payload, field_revisions, revision, tombstone
            ) values (
                v_owner, v_dataset.id, v_conflict.entity_key, v_conflict.kind,
                p_device_payload, v_field_revisions, v_revision, false
            ) on conflict (owner_id, entity_key) do update
            set kind = excluded.kind,
                payload = excluded.payload,
                field_revisions = excluded.field_revisions,
                revision = excluded.revision, tombstone = false, tombstoned_at = null, updated_at = now();
        end if;
        update public.datasets set revision = v_revision, updated_at = now() where id = v_dataset.id;
        perform public.recalculate_sync_manifest(v_owner, v_dataset.id);
    end if;

    update public.sync_conflicts set resolved_at = now(), resolution = p_resolution where id = p_conflict_id;
    return jsonb_build_object('status','resolved','revision',v_revision);
end;
$$;

create or replace function public.acknowledge_sync_revision(p_device_id uuid, p_revision bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid := (select auth.uid());
begin
    if v_owner is null then raise exception 'authentication required'; end if;
    update public.sync_devices set last_observed_revision = greatest(last_observed_revision, p_revision), updated_at = now()
    where owner_id = v_owner and id = p_device_id and revoked_at is null;
    if not found then raise exception 'unknown or revoked device'; end if;
end;
$$;

revoke all on function public.register_sync_device(uuid, bigint) from public, anon;
revoke all on function public.apply_sync_mutation(uuid, uuid, text, text, bigint, text, jsonb, text[], timestamptz) from public, anon;
revoke all on function public.resolve_sync_conflict(uuid, text, uuid, boolean, jsonb) from public, anon;
revoke all on function public.acknowledge_sync_revision(uuid, bigint) from public, anon;
grant execute on function public.register_sync_device(uuid, bigint) to authenticated;
grant execute on function public.apply_sync_mutation(uuid, uuid, text, text, bigint, text, jsonb, text[], timestamptz) to authenticated;
grant execute on function public.resolve_sync_conflict(uuid, text, uuid, boolean, jsonb) to authenticated;
grant execute on function public.acknowledge_sync_revision(uuid, bigint) to authenticated;

-- Dataset revision updates are the lightweight wake-up signal. Clients always
-- re-read canonical rows through RLS/RPC; they never trust event payloads.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'datasets'
    ) then
        alter publication supabase_realtime add table public.datasets;
    end if;
end;
$$;
