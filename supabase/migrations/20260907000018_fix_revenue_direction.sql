-- =============================================================
-- Los ingresos deben contar solo los cargos de dirección ingreso
--
-- Al generalizar los movimientos con direction/scope, esta vista
-- quedó sin actualizar y sumaba TODOS los cargos como ingreso.
-- Consecuencia: un proyecto sin ventas mostraba ingresos iguales
-- a sus propios gastos, y un margen positivo inexistente.
-- =============================================================

create or replace view public.project_annual_revenue as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
years as (
  select generate_series(
    extract(year from current_date)::int - 1,
    extract(year from current_date)::int + 3
  ) as yr
),
charge_rows as (
  select
    c.project_id,
    y.yr,
    case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end as usd
  from public.project_charges c
  cross join years y
  cross join rate r
  where c.direction = 'ingreso'
    and extract(year from c.charge_date)::int = y.yr
),
service_rows as (
  select
    s.project_id,
    y.yr,
    case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end
      * public.payments_in_year_from(
          coalesce(sc.renewal_date, s.next_billing_date),
          s.frequency,
          y.yr,
          sc.effective_first_charge
        ) as usd
  from public.recurring_services s
  left join public.service_schedule sc on sc.service_id = s.id
  cross join years y
  cross join rate r
  where s.active
    and s.direction = 'ingreso'
    and s.project_id is not null
    and s.amount is not null
    and s.confirmation_status <> 'rechazada'
)
select project_id, yr as year, round(sum(usd)::numeric, 2) as usd_total
from (select * from charge_rows union all select * from service_rows) t
where project_id is not null
group by project_id, yr;

-- -------------------------------------------------------------
-- El costo por año tampoco debe ignorar los egresos únicos:
-- un gasto puntual del proyecto es costo, no queda fuera.
-- -------------------------------------------------------------

create or replace view public.project_annual_costs as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
years as (
  select generate_series(
    extract(year from current_date)::int - 1,
    extract(year from current_date)::int + 3
  ) as yr
),
asset_rows as (
  select
    aa.project_id,
    y.yr,
    case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end
      * public.payments_in_year(
          case when a.billing_cycle = 'unico' then a.paid_at else a.expires_at end,
          a.billing_cycle, y.yr
        ) as usd
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  cross join years y
  cross join rate r
  where aa.assigned_until is null
    and a.deleted_at is null
    and a.cost is not null
),
service_rows as (
  select
    s.project_id,
    y.yr,
    case when s.net_currency = 'UYU' then s.net_cost / r.usd_uyu else s.net_cost end
      * public.payments_in_year(
          coalesce(s.next_billing_date, s.expires_at), s.frequency, y.yr
        ) as usd
  from public.recurring_services s
  cross join years y
  cross join rate r
  where s.active
    and s.project_id is not null
    and s.net_cost is not null
),
charge_rows as (
  select
    c.project_id,
    y.yr,
    case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end as usd
  from public.project_charges c
  cross join years y
  cross join rate r
  where c.direction = 'egreso'
    and c.project_id is not null
    and extract(year from c.charge_date)::int = y.yr
)
select project_id, yr as year, round(sum(usd)::numeric, 2) as usd_total
from (
  select * from asset_rows
  union all
  select * from service_rows
  union all
  select * from charge_rows
) t
where project_id is not null
group by project_id, yr;
