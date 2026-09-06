-- =============================================================
-- El costo del proyecto excluye lo que paga el cliente
--
-- El desglose ya lo mostraba en cero, pero el resultado por año y
-- el run rate seguían sumándolo: el mismo servicio aparecía como
-- costo en un panel y como no-costo en el de al lado.
-- =============================================================

create or replace view public.project_costs as
with client_methods as (
  select id from public.payment_methods where owner_client_id is not null
),
asset_costs as (
  select
    aa.project_id,
    a.currency,
    public.to_monthly(a.cost, a.billing_cycle) as monthly
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  where aa.assigned_until is null
    and a.deleted_at is null
    and a.ownership = 'nova'
    and (a.payment_method_id is null
         or a.payment_method_id not in (select id from client_methods))
),
service_costs as (
  select
    s.project_id,
    s.net_currency as currency,
    public.to_monthly(s.net_cost, s.frequency) as monthly
  from public.recurring_services s
  where s.active and s.project_id is not null
    and (s.payment_method_id is null
         or s.payment_method_id not in (select id from client_methods))
)
select
  project_id,
  currency,
  round(sum(monthly), 2) as net_monthly,
  round(sum(monthly) * 12, 2) as net_yearly
from (select * from asset_costs union all select * from service_costs) t
where project_id is not null
group by project_id, currency;

create or replace view public.project_annual_costs as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
client_methods as (
  select id from public.payment_methods where owner_client_id is not null
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
    and a.ownership = 'nova'
    and (a.payment_method_id is null
         or a.payment_method_id not in (select id from client_methods))
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
    and (s.payment_method_id is null
         or s.payment_method_id not in (select id from client_methods))
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
    and (c.payment_method_id is null
         or c.payment_method_id not in (select id from client_methods))
    and extract(year from c.charge_date)::int = y.yr
)
select project_id, yr as year, round(sum(usd)::numeric, 2) as usd_total
from (
  select * from asset_rows
  union all select * from service_rows
  union all select * from charge_rows
) t
where project_id is not null
group by project_id, yr;
