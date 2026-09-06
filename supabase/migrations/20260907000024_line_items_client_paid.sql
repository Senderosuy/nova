-- El desglose muestra lo que paga el cliente como referencia:
-- que no sea costo de Nova no significa que no cueste nada.

create or replace view public.project_line_items as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
client_methods as (
  select id from public.payment_methods where owner_client_id is not null
),
factor as (
  select 'mensual' as cycle, 12 as per_year union all
  select 'trimestral', 4 union all
  select 'semestral', 2 union all
  select 'anual', 1 union all
  select 'unico', 0 union all
  select 'gratis', 0
),
asset_lines as (
  select
    aa.project_id,
    'activo' as kind,
    a.type as subkind,
    a.name as concept,
    a.expires_at,
    round(
      (case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end
       * coalesce(f.per_year, 1))::numeric, 2
    ) as cost_usd_year,
    0::numeric as price_usd_year,
    a.billing_cycle as cycle,
    coalesce(pm.label, prov.name) as paid_with,
    (a.ownership = 'cliente'
     or a.payment_method_id in (select id from client_methods)) as paid_by_client
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  cross join rate r
  left join factor f on f.cycle = a.billing_cycle
  left join public.payment_methods pm on pm.id = a.payment_method_id
  left join public.providers prov on prov.id = a.provider_id
  where aa.assigned_until is null
    and a.deleted_at is null
    and a.cost is not null
),
service_lines as (
  select
    s.project_id,
    'servicio',
    s.frequency,
    s.concept,
    sc.renewal_date,
    round(
      (case when s.net_currency = 'UYU' then coalesce(s.net_cost, 0) / r.usd_uyu
            else coalesce(s.net_cost, 0) end
       * coalesce(f.per_year, 1))::numeric, 2
    ),
    round(
      (case when s.currency = 'UYU' then coalesce(s.amount, 0) / r.usd_uyu
            else coalesce(s.amount, 0) end
       * coalesce(f.per_year, 1))::numeric, 2
    ),
    s.frequency,
    pm.label,
    (s.payment_method_id in (select id from client_methods))
  from public.recurring_services s
  cross join rate r
  left join factor f on f.cycle = s.frequency
  left join public.service_schedule sc on sc.service_id = s.id
  left join public.payment_methods pm on pm.id = s.payment_method_id
  where s.active and s.project_id is not null and s.scope = 'proyecto'
),
charge_lines as (
  select
    c.project_id,
    'cargo',
    c.direction,
    c.concept,
    c.charge_date,
    case when c.direction = 'egreso'
      then round((case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end)::numeric, 2)
      else 0 end,
    case when c.direction = 'ingreso'
      then round((case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end)::numeric, 2)
      else 0 end,
    'unico',
    pm.label,
    (c.payment_method_id in (select id from client_methods))
  from public.project_charges c
  cross join rate r
  left join public.payment_methods pm on pm.id = c.payment_method_id
  where c.project_id is not null
    and c.scope = 'proyecto'
    and extract(year from c.charge_date)::int = extract(year from current_date)::int
)
select
  project_id, kind, subkind, concept, expires_at, cycle, paid_with,
  -- El costo mostrado es cero cuando lo paga el cliente; el importe
  -- real queda en reference_usd_year para no ocultarlo.
  case when paid_by_client then 0 else cost_usd_year end as cost_usd_year,
  price_usd_year,
  round((price_usd_year - case when paid_by_client then 0 else cost_usd_year end)::numeric, 2)
    as margin_usd_year,
  paid_by_client,
  cost_usd_year as reference_usd_year
from (
  select * from asset_lines
  union all select * from service_lines
  union all select * from charge_lines
) t;
