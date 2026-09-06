-- =============================================================
-- Naturaleza del proyecto: de cliente o producto propio de Nova
--
-- En un producto propio el costo no es un problema a corregir:
-- es inversión. El margen negativo de un cliente es una alerta;
-- el de un producto propio es lo esperable hasta que monetice.
-- =============================================================

alter table public.projects
  add column ownership_type text not null default 'cliente'
    check (ownership_type in ('cliente', 'propio'));

comment on column public.projects.ownership_type is
  'cliente: trabajo facturable a un tercero. propio: producto de Nova, su costo es inversión.';

-- -------------------------------------------------------------
-- Inversión y retorno acumulados de un proyecto.
-- Sólo cuenta movimientos ya ocurridos: no proyecta al futuro.
-- -------------------------------------------------------------

create or replace view public.project_investment as
select
  p.id as project_id,
  p.name,
  p.ownership_type,
  -- Invertido: todo egreso de proyecto hasta hoy
  round(coalesce(sum(m.usd) filter (
    where m.direction = 'egreso' and m.occurred_on <= current_date
  ), 0)::numeric, 2) as invested_total_usd,
  round(coalesce(sum(m.usd) filter (
    where m.direction = 'egreso'
      and extract(year from m.occurred_on)::int = extract(year from current_date)::int
      and m.occurred_on <= current_date
  ), 0)::numeric, 2) as invested_year_usd,
  -- Retorno: todo ingreso hasta hoy
  round(coalesce(sum(m.usd) filter (
    where m.direction = 'ingreso' and m.occurred_on <= current_date
  ), 0)::numeric, 2) as returned_total_usd,
  -- Posición neta: negativa mientras no recupere la inversión
  round((
    coalesce(sum(m.usd) filter (where m.direction = 'ingreso' and m.occurred_on <= current_date), 0)
    - coalesce(sum(m.usd) filter (where m.direction = 'egreso' and m.occurred_on <= current_date), 0)
  )::numeric, 2) as net_position_usd
from public.projects p
left join public.cash_movements m on m.project_id = p.id
where p.deleted_at is null
group by p.id, p.name, p.ownership_type;
