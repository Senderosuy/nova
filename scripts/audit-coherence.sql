-- =============================================================
-- AUDITORÍA DE COHERENCIA FINANCIERA
--
-- Correr después de tocar cualquier vista que sume dinero.
--   npx supabase db query --linked --file scripts/audit-coherence.sql
--
-- Toda fila con estado 'INCOHERENTE' es un bug: el mismo proyecto
-- da costos distintos según la vía. Las reglas de exclusión del
-- SPEC §3 tienen que aplicarse igual en todas las vistas.
-- =============================================================

-- 1. Costo por proyecto: tres vías deben coincidir (año en curso)
with li as (
  select project_id, round(sum(cost_usd_year), 2) as v
  from public.project_line_items group by project_id
),
ac as (
  select project_id, usd_total as v
  from public.project_annual_costs
  where year = extract(year from current_date)::int
),
cm as (
  select project_id, round(sum(usd), 2) as v
  from public.cash_movements
  where direction = 'egreso' and scope = 'proyecto'
    and extract(year from occurred_on) = extract(year from current_date)
  group by project_id
)
select
  'costo por proyecto' as chequeo,
  p.name,
  coalesce(li.v, 0)::text as line_items,
  coalesce(ac.v, 0)::text as annual_costs,
  coalesce(cm.v, 0)::text as cash_movements,
  case
    when abs(coalesce(li.v, 0) - coalesce(ac.v, 0)) > 1
      or abs(coalesce(ac.v, 0) - coalesce(cm.v, 0)) > 1
    then 'INCOHERENTE' else 'ok'
  end as estado
from public.projects p
left join li on li.project_id = p.id
left join ac on ac.project_id = p.id
left join cm on cm.project_id = p.id
where p.deleted_at is null

union all

-- 2. Aporte del socio = egresos no pagados por clientes ni por Nova
select
  'aporte del socio',
  'Cristian Safie',
  (select contributed_usd from public.partner_account where name = 'Cristian Safie')::text,
  (select round(sum(m.usd), 2) from public.cash_movements m
   left join public.payment_methods pm on pm.id = m.payment_method_id
   where m.direction = 'egreso' and m.occurred_on <= current_date
     and pm.owner_client_id is null)::text,
  '',
  case when abs(
    (select contributed_usd from public.partner_account where name = 'Cristian Safie')
    - (select sum(m.usd) from public.cash_movements m
       left join public.payment_methods pm on pm.id = m.payment_method_id
       where m.direction = 'egreso' and m.occurred_on <= current_date
         and pm.owner_client_id is null)
  ) > 1 then 'INCOHERENTE' else 'ok' end

union all

-- 3. Ningún servicio de ingreso con amount 0 y net_cost > 0
select
  'servicios contradictorios', '', count(*)::text, '', '',
  case when count(*) > 0 then 'INCOHERENTE' else 'ok' end
from public.recurring_services
where active and direction = 'ingreso'
  and coalesce(amount, 0) = 0 and coalesce(net_cost, 0) > 0

union all

-- 4. Activos del cliente no deben aparecer como costo de Nova en ninguna vista
select
  'activos de cliente en line_items', '', count(*)::text, '', '',
  case when count(*) > 0 then 'INCOHERENTE' else 'ok' end
from public.project_line_items l
join public.assets a on a.name = l.concept and a.deleted_at is null
where l.kind = 'activo' and a.ownership = 'cliente' and l.cost_usd_year > 0

order by estado desc, chequeo;
