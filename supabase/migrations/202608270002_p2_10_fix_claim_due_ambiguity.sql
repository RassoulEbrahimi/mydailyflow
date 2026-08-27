-- Qualify reminder_schedules columns that collide with RETURNS TABLE output
-- variables in PL/pgSQL. The original function failed before claiming any
-- delivery because `expires_at` was ambiguous.
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
    if p_limit not between 1 and 500 or p_lease_seconds not between 10 and 300 then
        raise exception 'invalid claim limits';
    end if;

    update public.reminder_schedules as rs
    set state = 'expired', updated_at = now()
    where rs.state = 'scheduled' and rs.expires_at <= now();

    update public.reminder_deliveries as d
    set state = 'cancelled', updated_at = now()
    from public.reminder_schedules as s
    where d.schedule_id = s.id
      and d.state in ('pending', 'leased')
      and s.state <> 'scheduled';

    return query
    with candidates as (
        select d.id
        from public.reminder_deliveries as d
        join public.reminder_schedules as s on s.id = d.schedule_id
        join public.push_subscriptions as ps on ps.id = d.subscription_id
        where s.state = 'scheduled'
          and s.intended_at <= now()
          and s.expires_at > now()
          and ps.revoked_at is null
          and (d.state = 'pending' or (d.state = 'leased' and d.lease_until < now()))
        order by s.intended_at, d.id
        for update of d skip locked
        limit p_limit
    ), claimed as (
        update public.reminder_deliveries as d
        set state = 'leased', lease_token = gen_random_uuid(),
            lease_until = now() + make_interval(secs => p_lease_seconds),
            attempt_count = d.attempt_count + 1, updated_at = now()
        from candidates as c
        where d.id = c.id
        returning d.*
    )
    select c.id, c.lease_token, ds.decrypted_secret::jsonb,
           'mdf-reminder-' || c.schedule_id::text || '-' || c.schedule_generation::text,
           s.expires_at
    from claimed as c
    join public.reminder_schedules as s on s.id = c.schedule_id
    join public.push_subscriptions as ps on ps.id = c.subscription_id
    join vault.decrypted_secrets as ds on ds.id = ps.secret_id;
end;
$$;

revoke all on function public.claim_due_reminder_deliveries(integer, integer)
from public, anon, authenticated;
grant execute on function public.claim_due_reminder_deliveries(integer, integer)
to service_role;
