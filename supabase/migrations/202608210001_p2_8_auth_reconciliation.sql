-- P2-8: identity-owned manifest and first-sign-in intent only.
-- No task/essential payload or normal-sync table is introduced in this phase.

create table if not exists public.datasets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    revision bigint not null default 0 check (revision >= 0),
    item_count integer not null default 0 check (item_count >= 0),
    item_counts jsonb not null default '{"tasks":0,"essentials":0,"essentialHistoryDays":0,"focusSessions":0,"templates":0}'::jsonb,
    digest text,
    latest_activity timestamptz,
    reconciliation_status text not null default 'none' check (reconciliation_status in ('none', 'prepared')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id)
);

create index if not exists datasets_owner_id_idx on public.datasets(owner_id);
alter table public.datasets enable row level security;

create table if not exists public.reconciliation_intents (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    dataset_id uuid not null references public.datasets(id) on delete cascade,
    choice text not null check (choice in (
        'start-empty',
        'upload-local',
        'download-account',
        'merge-with-conflicts',
        'keep-device-separate'
    )),
    local_manifest jsonb not null,
    account_manifest jsonb not null,
    status text not null default 'prepared' check (status = 'prepared'),
    created_at timestamptz not null default now()
);

create index if not exists reconciliation_intents_owner_id_idx on public.reconciliation_intents(owner_id);
alter table public.reconciliation_intents enable row level security;

revoke all on public.datasets from anon, authenticated;
revoke all on public.reconciliation_intents from anon, authenticated;
-- P2-8 clients only read their manifest. All writes cross the reviewed RPC;
-- direct table mutation remains unavailable until P2-9 defines sync semantics.
grant select on public.datasets to authenticated;

create policy "dataset owner may select"
on public.datasets for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "dataset owner may insert"
on public.datasets for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "dataset owner may update"
on public.datasets for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "dataset owner may delete"
on public.datasets for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "intent owner may select"
on public.reconciliation_intents for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "intent owner may insert"
on public.reconciliation_intents for insert to authenticated
with check (
    (select auth.uid()) = owner_id
    and exists (
        select 1 from public.datasets d
        where d.id = dataset_id and d.owner_id = (select auth.uid())
    )
);

create or replace function public.prepare_first_sign_in_reconciliation(
    p_choice text,
    p_local_manifest jsonb,
    p_expected_remote_revision bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_owner uuid := (select auth.uid());
    v_dataset public.datasets%rowtype;
    v_intent_id uuid;
    v_account_manifest jsonb;
begin
    if v_owner is null then
        raise exception 'authentication required';
    end if;
    if p_choice not in ('start-empty', 'upload-local', 'download-account', 'merge-with-conflicts', 'keep-device-separate') then
        raise exception 'invalid reconciliation choice';
    end if;
    if jsonb_typeof(p_local_manifest) <> 'object' then
        raise exception 'invalid local manifest';
    end if;

    select * into v_dataset
    from public.datasets
    where owner_id = v_owner
    for update;

    if not found then
        if p_expected_remote_revision is not null then
            raise exception 'remote revision changed';
        end if;
        insert into public.datasets (owner_id)
        values (v_owner)
        returning * into v_dataset;
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
        owner_id, dataset_id, choice, local_manifest, account_manifest
    ) values (
        v_owner, v_dataset.id, p_choice, p_local_manifest, v_account_manifest
    ) returning id into v_intent_id;

    update public.datasets
    set reconciliation_status = 'prepared', updated_at = now()
    where id = v_dataset.id;

    return v_intent_id;
end;
$$;

revoke all on function public.prepare_first_sign_in_reconciliation(text, jsonb, bigint) from public, anon;
grant execute on function public.prepare_first_sign_in_reconciliation(text, jsonb, bigint) to authenticated;
