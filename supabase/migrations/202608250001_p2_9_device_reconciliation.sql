-- P2-9 live beta hardening: first-sign-in reconciliation belongs to a device,
-- not to the whole account. Legacy intents remain readable for audit but are
-- never used to bootstrap a newly registered device.

alter table public.reconciliation_intents
    add column if not exists device_id uuid;

create index if not exists reconciliation_intents_owner_device_created_idx
    on public.reconciliation_intents(owner_id, device_id, created_at desc);

drop function if exists public.prepare_first_sign_in_reconciliation(text, jsonb, bigint);

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
    if p_choice not in ('start-empty', 'upload-local', 'download-account', 'merge-with-conflicts', 'keep-device-separate') then
        raise exception 'invalid reconciliation choice';
    end if;
    if jsonb_typeof(p_local_manifest) <> 'object' then raise exception 'invalid local manifest'; end if;

    select * into v_dataset
    from public.datasets
    where owner_id = v_owner
    for update;

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

    update public.datasets
    set reconciliation_status = 'prepared', updated_at = now()
    where id = v_dataset.id;

    return v_intent_id;
end;
$$;

revoke all on function public.prepare_first_sign_in_reconciliation(text, jsonb, bigint, uuid) from public, anon;
grant execute on function public.prepare_first_sign_in_reconciliation(text, jsonb, bigint, uuid) to authenticated;
