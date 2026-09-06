-- =============================================================
-- Alertas de la cadena de renovación
--   1. Confirmar con el cliente   (lead_days antes del vencimiento)
--   2. Cobrar la anualidad        (sólo si confirmó)
--   3. Renovar ante el proveedor  (sólo si confirmó; ya cubierto por
--      la alerta del activo, acá se le da contexto de negocio)
-- Si el cliente rechaza, no se generan las alertas siguientes.
-- =============================================================

alter table public.alerts
  drop constraint if exists alerts_source_chk;

alter table public.alerts
  add column if not exists service_stage text
    check (service_stage in ('confirmacion', 'cobro'));

alter table public.alerts
  add constraint alerts_source_chk check (
    (source_type = 'asset' and asset_id is not null and service_id is null) or
    (source_type = 'service' and service_id is not null and asset_id is null)
  );

-- Dedupe por etapa: confirmación y cobro pueden compartir umbral y fecha
drop index if exists alerts_service_dedupe_idx;
create unique index alerts_service_dedupe_idx
  on public.alerts (service_id, threshold_days, due_date, coalesce(service_stage, ''))
  where service_id is not null;

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

    -- 1. Activos por vencer
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

    -- 2. Confirmación con el cliente: vence la ventana de confirmación
    insert into public.alerts
      (source_type, service_id, threshold_days, due_date, suggested_action, service_stage)
    select 'service', sc.service_id, t, sc.confirm_by,
           'Confirmar con el cliente la continuidad de: ' || sc.concept ||
           coalesce(' (ancla: ' || sc.anchor_asset || ')', '') ||
           '. Sin confirmación no se renueva.',
           'confirmacion'
    from public.service_schedule sc
    where sc.confirmation_status = 'pendiente'
      and sc.confirm_by is not null
      and sc.confirm_by >= current_date
      and sc.confirm_by - current_date <= t
    on conflict (service_id, threshold_days, due_date, coalesce(service_stage, ''))
      where service_id is not null
    do nothing;
    get diagnostics n = row_count;
    total := total + n;

    -- 3. Cobro: sólo si el cliente ya confirmó y no se cobró
    insert into public.alerts
      (source_type, service_id, threshold_days, due_date, suggested_action, service_stage)
    select 'service', sc.service_id, t, sc.renewal_date,
           'Cobrar ' || sc.concept || ' — ' || sc.currency || ' ' || sc.amount ||
           coalesce('. Renovación: ' || sc.renewal_date::text, ''),
           'cobro'
    from public.service_schedule sc
    where sc.confirmation_status = 'confirmada'
      and sc.billing_status = 'pendiente'
      and sc.renewal_date is not null
      and sc.renewal_date >= current_date
      and sc.renewal_date - current_date <= t
    on conflict (service_id, threshold_days, due_date, coalesce(service_stage, ''))
      where service_id is not null
    do nothing;
    get diagnostics n = row_count;
    total := total + n;

  end loop;

  return total;
end;
$$;

-- Al rechazar la continuidad, se cierran las alertas abiertas del servicio:
-- no tiene sentido avisar de cobrar o renovar algo que se da de baja.
create or replace function public.close_alerts_on_rejection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmation_status = 'rechazada'
     and old.confirmation_status is distinct from 'rechazada' then
    update public.alerts
    set status = 'resuelta', resolved_at = now()
    where service_id = new.id and status in ('pendiente', 'vista');
  end if;
  return new;
end;
$$;

drop trigger if exists recurring_services_rejection on public.recurring_services;
create trigger recurring_services_rejection
  after update on public.recurring_services
  for each row execute function public.close_alerts_on_rejection();
