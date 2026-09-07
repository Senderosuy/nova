-- =============================================================
-- Ingreso comprometido vs proyectado
--
-- El panel contaba como ingreso corriente las anualidades que
-- todavía nadie confirmó ni pagó, y varias a año vencido cuyo
-- primer cobro recién ocurre el año que viene. La pregunta que
-- responde el panel —¿Nova se sostiene sola?— exige separar lo
-- que ya está comprometido de lo que es expectativa.
--
--   comprometido: el cliente confirmó que sigue
--   proyectado:   todo lo cargado, confirmado o no
-- =============================================================

create or replace view public.sustainability as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
client_methods as (
  select id from public.payment_methods where owner_client_id is not null
),
recurring_out as (
  select coalesce(sum(
    public.to_monthly(
      case when s.net_currency = 'UYU' then s.net_cost / r.usd_uyu else s.net_cost end,
      s.frequency
    )
  ), 0) as monthly
  from public.recurring_services s
  cross join rate r
  where s.active and s.direction = 'egreso' and s.net_cost is not null
    and (s.payment_method_id is null
         or s.payment_method_id not in (select id from client_methods))
),
asset_out as (
  select coalesce(sum(
    public.to_monthly(
      case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end,
      a.billing_cycle
    )
  ), 0) as monthly
  from public.assets a
  cross join rate r
  where a.deleted_at is null and a.cost is not null
    and a.ownership = 'nova'
    and (a.payment_method_id is null
         or a.payment_method_id not in (select id from client_methods))
),
-- Comprometido: el cliente ya confirmó que continúa
confirmed_in as (
  select coalesce(sum(
    public.to_monthly(
      case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end,
      s.frequency
    )
  ), 0) as monthly
  from public.recurring_services s
  cross join rate r
  where s.active and s.direction = 'ingreso'
    and s.confirmation_status = 'confirmada'
    and s.amount is not null
),
-- Proyectado: todo lo cargado que no fue rechazado
projected_in as (
  select coalesce(sum(
    public.to_monthly(
      case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end,
      s.frequency
    )
  ), 0) as monthly
  from public.recurring_services s
  cross join rate r
  where s.active and s.direction = 'ingreso'
    and s.confirmation_status <> 'rechazada'
    and s.amount is not null
)
select
  round((ro.monthly + ao.monthly)::numeric, 2) as fixed_monthly_usd,
  round(ci.monthly::numeric, 2) as recurring_revenue_usd,
  round((ci.monthly - ro.monthly - ao.monthly)::numeric, 2) as gap_usd,
  round(((ro.monthly + ao.monthly) * (select value from public.app_settings where key = 'reserve_months'))::numeric, 2) as reserve_target_usd,
  case
    when (ro.monthly + ao.monthly) = 0 then 100
    when ci.monthly >= (ro.monthly + ao.monthly) then 100
    else round((ci.monthly / (ro.monthly + ao.monthly) * 100)::numeric, 1)
  end as coverage_pct,
  -- Columnas nuevas al final: create or replace no permite intercalarlas
  round(pi.monthly::numeric, 2) as projected_revenue_usd,
  round((pi.monthly - ro.monthly - ao.monthly)::numeric, 2) as projected_gap_usd,
  case
    when (ro.monthly + ao.monthly) = 0 then 100
    when pi.monthly >= (ro.monthly + ao.monthly) then 100
    else round((pi.monthly / (ro.monthly + ao.monthly) * 100)::numeric, 1)
  end as projected_coverage_pct
from recurring_out ro, asset_out ao, confirmed_in ci, projected_in pi;
