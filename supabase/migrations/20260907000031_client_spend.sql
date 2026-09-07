-- =============================================================
-- Gasto del cliente por proyecto
--
-- Lo que el cliente paga de su bolsillo no impacta las cuentas de
-- Nova, pero sí lo administramos y en muchos casos lo recomendamos.
-- Es material de conversación: cuando pregunte por qué paga lo que
-- paga, la respuesta tiene que estar a mano, agrupada por proveedor
-- y con el detalle de qué incluye.
--
-- No se compara con lo que Nova le factura: son cosas independientes.
-- =============================================================

create or replace view public.client_spend_items as
with client_methods as (
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
-- Activos que paga el cliente: propios suyos o con su medio de pago
asset_items as (
  select
    aa.project_id,
    a.id as item_id,
    'activo' as kind,
    a.name as concept,
    coalesce(a.provider, 'Sin proveedor') as provider,
    a.billing_cycle as cycle,
    a.expires_at,
    public.to_usd(a.cost, a.currency) as amount_usd,
    round((public.to_usd(a.cost, a.currency) * coalesce(f.per_year, 0))::numeric, 2) as usd_year,
    pm.label as paid_with
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  left join factor f on f.cycle = a.billing_cycle
  left join public.payment_methods pm on pm.id = a.payment_method_id
  where aa.assigned_until is null
    and a.deleted_at is null
    and a.cost is not null
    and (a.ownership = 'cliente' or a.payment_method_id in (select id from client_methods))
),
-- Servicios pagados con un medio del cliente
service_items as (
  select
    s.project_id,
    s.id,
    'servicio',
    s.concept,
    coalesce(pr.name, 'Sin proveedor'),
    s.frequency,
    sc.renewal_date,
    public.to_usd(s.net_cost, s.net_currency),
    round((public.to_usd(s.net_cost, s.net_currency) * coalesce(f.per_year, 0))::numeric, 2),
    pm.label
  from public.recurring_services s
  left join factor f on f.cycle = s.frequency
  left join public.service_schedule sc on sc.service_id = s.id
  left join public.payment_methods pm on pm.id = s.payment_method_id
  left join public.providers pr on pr.id = s.provider_id
  where s.active
    and s.project_id is not null
    and s.net_cost is not null
    and s.payment_method_id in (select id from client_methods)
)
select * from asset_items
union all
select * from service_items;

-- -------------------------------------------------------------
-- Resumen por proveedor: la lectura que sirve para conversar
-- -------------------------------------------------------------

create or replace view public.client_spend_by_provider as
select
  project_id,
  provider,
  count(*) as items_count,
  round(sum(usd_year) / 12, 2) as usd_month,
  round(sum(usd_year), 2) as usd_year,
  min(expires_at) filter (where expires_at >= current_date) as next_due
from public.client_spend_items
group by project_id, provider;
