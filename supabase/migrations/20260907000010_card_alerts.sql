-- Suma al barrido diario las alertas de vencimiento de tarjeta.
-- La acción sugerida incluye cuántos activos y servicios dependen
-- de ella, para dimensionar el impacto de no renovarla a tiempo.

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

    insert into public.alerts (source_type, asset_id, threshold_days, due_date, suggested_action)
    select 'asset', a.id, t, a.expires_at,
           case a.type
             when 'dominio' then 'Renovar dominio ' || a.name
             when 'hosting' then 'Renovar hosting ' || a.name
             when 'licencia' then 'Renovar licencia ' || a.name
             else 'Renovar o dar de baja: ' || a.name
           end
    from public.assets a
    where a.deleted_at is null and a.expires_at is not null
      and a.expires_at >= current_date and a.expires_at - current_date <= t
    on conflict (asset_id, threshold_days, due_date) where asset_id is not null
    do nothing;
    get diagnostics n = row_count; total := total + n;

    insert into public.alerts
      (source_type, service_id, threshold_days, due_date, suggested_action, service_stage)
    select 'service', sc.service_id, t, sc.confirm_by,
           'Confirmar con el cliente la continuidad de: ' || sc.concept ||
           coalesce(' (ancla: ' || sc.anchor_asset || ')', '') ||
           '. Sin confirmación no se renueva.', 'confirmacion'
    from public.service_schedule sc
    join public.recurring_services s on s.id = sc.service_id
    where sc.confirmation_status = 'pendiente' and s.direction = 'ingreso'
      and sc.frequency in ('anual', 'semestral')
      and sc.confirm_by is not null and sc.confirm_by >= current_date
      and sc.confirm_by - current_date <= t
    on conflict (service_id, threshold_days, due_date, coalesce(service_stage, ''))
      where service_id is not null
    do nothing;
    get diagnostics n = row_count; total := total + n;

    insert into public.alerts
      (source_type, service_id, threshold_days, due_date, suggested_action, service_stage)
    select 'service', sc.service_id, t, sc.renewal_date,
           'Cobrar ' || sc.concept || ' — ' || sc.currency || ' ' || sc.amount ||
           coalesce('. Renovación: ' || sc.renewal_date::text, ''), 'cobro'
    from public.service_schedule sc
    join public.recurring_services s on s.id = sc.service_id
    where sc.confirmation_status = 'confirmada' and sc.billing_status = 'pendiente'
      and s.direction = 'ingreso' and coalesce(sc.amount, 0) > 0
      and sc.frequency in ('anual', 'semestral')
      and sc.renewal_date is not null and sc.renewal_date >= current_date
      and sc.renewal_date - current_date <= t
    on conflict (service_id, threshold_days, due_date, coalesce(service_stage, ''))
      where service_id is not null
    do nothing;
    get diagnostics n = row_count; total := total + n;

    -- Tarjetas por vencer: impacto = todo lo que se debita de ellas
    insert into public.alerts
      (source_type, payment_method_id, threshold_days, due_date, suggested_action)
    select 'payment_method', u.payment_method_id, t, u.expires_on,
           'Renovar o actualizar ' || u.label || ': vence y de ella dependen ' ||
           u.assets_count || ' activo(s) y ' || u.services_count ||
           ' servicio(s) con débito automático.'
    from public.payment_method_usage u
    where u.expires_on is not null
      and u.expires_on >= current_date
      and u.expires_on - current_date <= t
    on conflict (payment_method_id, threshold_days, due_date)
      where payment_method_id is not null
    do nothing;
    get diagnostics n = row_count; total := total + n;

  end loop;

  return total;
end;
$$;
