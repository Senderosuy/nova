-- =============================================================
-- Motor de alertas: generación idempotente 90/60/30/15 + pg_cron
-- =============================================================

create extension if not exists pg_cron;

create or replace function public.generate_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t int;
  n int;
  total int := 0;
begin
  foreach t in array array[90, 60, 30, 15] loop

    -- Activos por vencer (dominios, hostings, licencias...)
    insert into public.alerts (source_type, asset_id, threshold_days, due_date, suggested_action)
    select 'asset', a.id, t, a.expires_at,
           case a.type
             when 'dominio' then 'Renovar dominio ' || a.name
             when 'hosting' then 'Renovar hosting ' || a.name
             when 'licencia' then 'Renovar licencia ' || a.name
             else 'Renovar o dar de baja: ' || a.name
           end
    from public.assets a
    where a.deleted_at is null
      and a.expires_at is not null
      and a.expires_at >= current_date
      and a.expires_at - current_date <= t
    on conflict (asset_id, threshold_days, due_date) where asset_id is not null
    do nothing;
    get diagnostics n = row_count;
    total := total + n;

    -- Servicios recurrentes: vencimiento del servicio
    insert into public.alerts (source_type, service_id, threshold_days, due_date, suggested_action)
    select 'service', s.id, t, s.expires_at, 'Renovar servicio: ' || s.concept
    from public.recurring_services s
    where s.active
      and s.expires_at is not null
      and s.expires_at >= current_date
      and s.expires_at - current_date <= t
    on conflict (service_id, threshold_days, due_date) where service_id is not null
    do nothing;
    get diagnostics n = row_count;
    total := total + n;

    -- Servicios recurrentes: próximo cobro
    insert into public.alerts (source_type, service_id, threshold_days, due_date, suggested_action)
    select 'service', s.id, t, s.next_billing_date, 'Cobrar: ' || s.concept
    from public.recurring_services s
    where s.active
      and s.next_billing_date is not null
      and s.next_billing_date >= current_date
      and s.next_billing_date - current_date <= t
    on conflict (service_id, threshold_days, due_date) where service_id is not null
    do nothing;
    get diagnostics n = row_count;
    total := total + n;

  end loop;

  return total;
end;
$$;

-- Barrido diario 09:00 UTC (06:00 Uruguay). schedule() con mismo nombre = upsert.
select cron.schedule('nova-alerts-daily', '0 9 * * *', 'select public.generate_alerts();');
