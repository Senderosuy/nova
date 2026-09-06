-- =============================================================
-- Vistas para el dashboard ejecutivo
--
-- El dashboard pasa de contar cosas a mostrar lo accionable:
-- qué vence, qué hay que cobrar, cómo viene el mes y qué fichas
-- están desactualizadas.
-- =============================================================

-- -------------------------------------------------------------
-- Próximos vencimientos: activos y servicios, unificados
-- -------------------------------------------------------------

create or replace view public.upcoming_renewals as
select
  a.id as source_id,
  'activo' as kind,
  a.name as concept,
  a.provider,
  a.expires_at as due_date,
  (a.expires_at - current_date) as days_left,
  a.auto_renew,
  pm.label as paid_with,
  p.name as project_name,
  case when a.currency = 'UYU'
    then round((a.cost / (select value from public.app_settings where key = 'usd_uyu_rate'))::numeric, 2)
    else a.cost
  end as usd_amount
from public.assets a
left join public.payment_methods pm on pm.id = a.payment_method_id
left join public.asset_assignments aa on aa.asset_id = a.id and aa.assigned_until is null
left join public.projects p on p.id = aa.project_id and p.deleted_at is null
where a.deleted_at is null
  and a.expires_at is not null
  and a.expires_at >= current_date
  and a.expires_at - current_date <= 180

union all

select
  s.id,
  'servicio',
  s.concept,
  null,
  sc.renewal_date,
  (sc.renewal_date - current_date),
  null,
  pm.label,
  p.name,
  case when s.net_currency = 'UYU'
    then round((s.net_cost / (select value from public.app_settings where key = 'usd_uyu_rate'))::numeric, 2)
    else s.net_cost
  end
from public.recurring_services s
join public.service_schedule sc on sc.service_id = s.id
left join public.payment_methods pm on pm.id = s.payment_method_id
left join public.projects p on p.id = s.project_id and p.deleted_at is null
where s.active
  and s.direction = 'egreso'
  and sc.renewal_date is not null
  and sc.renewal_date >= current_date
  and sc.renewal_date - current_date <= 180;

-- -------------------------------------------------------------
-- Cobros previstos: lo que Nova tiene que facturar
-- -------------------------------------------------------------

create or replace view public.upcoming_collections as
select
  sc.service_id,
  sc.concept,
  p.name as project_name,
  c.name as client_name,
  sc.renewal_date as due_date,
  (sc.renewal_date - current_date) as days_left,
  sc.confirm_by,
  sc.confirmation_status,
  sc.billing_status,
  case when sc.currency = 'UYU'
    then round((sc.amount / (select value from public.app_settings where key = 'usd_uyu_rate'))::numeric, 2)
    else sc.amount
  end as usd_amount
from public.service_schedule sc
join public.recurring_services s on s.id = sc.service_id
left join public.projects p on p.id = sc.project_id and p.deleted_at is null
left join public.clients c on c.id = p.client_id
where s.direction = 'ingreso'
  and coalesce(sc.amount, 0) > 0
  and sc.renewal_date is not null
  and sc.renewal_date >= current_date
  and sc.renewal_date - current_date <= 180;

-- -------------------------------------------------------------
-- Resumen por cliente: todos sus proyectos consolidados
-- -------------------------------------------------------------

create or replace view public.client_summary as
with li as (
  select
    p.client_id,
    sum(l.cost_usd_year) as cost_usd_year,
    sum(l.price_usd_year) as price_usd_year
  from public.project_line_items l
  join public.projects p on p.id = l.project_id and p.deleted_at is null
  group by p.client_id
)
select
  c.id as client_id,
  c.name,
  c.kind,
  c.status,
  (select count(*) from public.projects p
    where p.client_id = c.id and p.deleted_at is null) as projects_count,
  (select count(*) from public.asset_assignments aa
    join public.projects p on p.id = aa.project_id and p.deleted_at is null
    where p.client_id = c.id and aa.assigned_until is null) as assets_count,
  round(coalesce(li.cost_usd_year, 0), 2) as cost_usd_year,
  round(coalesce(li.price_usd_year, 0), 2) as revenue_usd_year,
  round(coalesce(li.price_usd_year, 0) - coalesce(li.cost_usd_year, 0), 2) as margin_usd_year
from public.clients c
left join li on li.client_id = c.id
where c.deleted_at is null;
