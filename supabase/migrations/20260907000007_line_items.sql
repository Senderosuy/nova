-- =============================================================
-- Desglose línea por línea: costo neto vs precio al cliente
-- Normalizado a base ANUAL en USD, con margen por ítem.
-- Un renglón por activo asignado, servicio recurrente y cargo único.
-- =============================================================

create or replace view public.project_line_items as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
-- Factor de ocurrencias por año según el ciclo
factor as (
  select 'mensual' as cycle, 12 as per_year union all
  select 'trimestral', 4 union all
  select 'semestral', 2 union all
  select 'anual', 1 union all
  select 'unico', 0 union all
  select 'gratis', 0
),

-- Activos asignados: costo puro, sin precio al cliente
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
    coalesce(pm.label, prov.name) as paid_with
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

-- Servicios recurrentes: tienen las dos caras
service_lines as (
  select
    s.project_id,
    'servicio' as kind,
    s.frequency as subkind,
    s.concept,
    sc.renewal_date as expires_at,
    round(
      (case when s.net_currency = 'UYU' then coalesce(s.net_cost, 0) / r.usd_uyu
            else coalesce(s.net_cost, 0) end
       * coalesce(f.per_year, 1))::numeric, 2
    ) as cost_usd_year,
    round(
      (case when s.currency = 'UYU' then coalesce(s.amount, 0) / r.usd_uyu
            else coalesce(s.amount, 0) end
       * coalesce(f.per_year, 1))::numeric, 2
    ) as price_usd_year,
    s.frequency as cycle,
    pm.label as paid_with
  from public.recurring_services s
  cross join rate r
  left join factor f on f.cycle = s.frequency
  left join public.service_schedule sc on sc.service_id = s.id
  left join public.payment_methods pm on pm.id = s.payment_method_id
  where s.active
    and s.project_id is not null
    and s.scope = 'proyecto'
),

-- Cargos únicos del año en curso: ingresos o egresos puntuales
charge_lines as (
  select
    c.project_id,
    'cargo' as kind,
    c.direction as subkind,
    c.concept,
    c.charge_date as expires_at,
    case when c.direction = 'egreso'
      then round((case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end)::numeric, 2)
      else 0 end as cost_usd_year,
    case when c.direction = 'ingreso'
      then round((case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end)::numeric, 2)
      else 0 end as price_usd_year,
    'unico' as cycle,
    pm.label as paid_with
  from public.project_charges c
  cross join rate r
  left join public.payment_methods pm on pm.id = c.payment_method_id
  where c.project_id is not null
    and c.scope = 'proyecto'
    and extract(year from c.charge_date)::int = extract(year from current_date)::int
)

select
  project_id, kind, subkind, concept, expires_at, cycle, paid_with,
  cost_usd_year,
  price_usd_year,
  round((price_usd_year - cost_usd_year)::numeric, 2) as margin_usd_year
from (
  select * from asset_lines
  union all
  select * from service_lines
  union all
  select * from charge_lines
) t;

-- -------------------------------------------------------------
-- Mismo desglose consolidado por cliente
-- -------------------------------------------------------------

create or replace view public.client_line_items as
select
  p.client_id,
  li.*
from public.project_line_items li
join public.projects p on p.id = li.project_id
where p.deleted_at is null;
