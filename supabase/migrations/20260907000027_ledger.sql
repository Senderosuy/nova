-- =============================================================
-- Libro de movimientos
--
-- cash_movements ya es el libro, pero sin nombres: trae ids y hay
-- que resolverlos en cada consulta. Esta vista los resuelve una vez
-- y agrega lo necesario para filtrar y leer: categoría, método,
-- proyecto, cliente, marca y a quién corresponde el gasto.
--
-- Todos los reportes futuros son agrupaciones de acá, no pantallas
-- nuevas: gasto por marca, por entidad, comparativo interanual.
-- =============================================================

create or replace view public.ledger as
select
  m.source_id,
  m.source_kind,
  m.direction,
  m.scope,
  m.concept,
  m.occurred_on,
  m.usd,
  m.status,
  extract(year from m.occurred_on)::int as year,
  to_char(m.occurred_on, 'YYYY-MM') as period,
  m.project_id,
  p.name as project_name,
  p.brand,
  p.client_id,
  c.name as client_name,
  m.category_id,
  ec.name as category_name,
  m.payment_method_id,
  pm.label as method_label,
  case
    when pm.owner_client_id is not null then 'cliente'
    when pm.owner_partner_id is not null then 'socio'
    when pm.id is not null then 'nova'
    else 'sin_metodo'
  end as method_owner
from public.cash_movements m
left join public.projects p on p.id = m.project_id and p.deleted_at is null
left join public.clients c on c.id = p.client_id
left join public.expense_categories ec on ec.id = m.category_id
left join public.payment_methods pm on pm.id = m.payment_method_id;

comment on view public.ledger is
  'Libro de movimientos con nombres resueltos. Fuente única de los reportes financieros: cada panel es una agrupación de esta vista.';
