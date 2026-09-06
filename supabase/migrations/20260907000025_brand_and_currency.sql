-- =============================================================
-- Marca por proyecto y moneda brasileña
--
-- Una entidad legal puede operar varias marcas: Senderos Group SAS
-- tiene Tannat, Winetour y Enoturismo. Sin este campo los proyectos
-- se mezclan y no se puede preguntar cuánto cuesta cada marca.
--
-- La marca es una etiqueta transversal, no un nivel de jerarquía:
-- la misma marca puede existir en más de una entidad.
-- =============================================================

alter table public.projects
  add column brand text;

comment on column public.projects.brand is
  'Marca comercial del proyecto. Transversal a la entidad legal: una marca puede operar en más de un país.';

create index projects_brand_idx on public.projects (brand) where brand is not null;

-- Molha e Safie factura en reales
alter table public.assets
  drop constraint if exists assets_currency_check;
alter table public.assets
  add constraint assets_currency_check check (currency in ('USD', 'UYU', 'BRL'));

alter table public.recurring_services
  drop constraint if exists recurring_services_currency_check;
alter table public.recurring_services
  add constraint recurring_services_currency_check check (currency in ('USD', 'UYU', 'BRL'));

alter table public.recurring_services
  drop constraint if exists recurring_services_net_currency_check;
alter table public.recurring_services
  add constraint recurring_services_net_currency_check check (net_currency in ('USD', 'UYU', 'BRL'));

alter table public.project_charges
  drop constraint if exists project_charges_currency_check;
alter table public.project_charges
  add constraint project_charges_currency_check check (currency in ('USD', 'UYU', 'BRL'));

alter table public.payment_methods
  drop constraint if exists payment_methods_currency_check;
alter table public.payment_methods
  add constraint payment_methods_currency_check check (currency in ('USD', 'UYU', 'BRL'));

insert into public.app_settings (key, value, label)
values ('brl_usd_rate', 5.35, 'Reales por dólar. Actualizar cuando cambie.')
on conflict (key) do nothing;

-- -------------------------------------------------------------
-- Conversión a USD centralizada: una sola función que conoce
-- todas las monedas, en vez de repetir el CASE en cada vista.
-- -------------------------------------------------------------

create or replace function public.to_usd(amount numeric, currency text)
returns numeric
language sql
stable
as $$
  select case
    when amount is null then null
    when currency = 'UYU' then amount / (select value from public.app_settings where key = 'usd_uyu_rate')
    when currency = 'BRL' then amount / (select value from public.app_settings where key = 'brl_usd_rate')
    else amount
  end;
$$;

-- -------------------------------------------------------------
-- Costo y margen por marca
-- -------------------------------------------------------------

create or replace view public.brand_summary as
select
  p.brand,
  c.name as client_name,
  count(distinct p.id) as projects_count,
  round(coalesce(sum(l.cost_usd_year), 0), 2) as cost_usd_year,
  round(coalesce(sum(l.price_usd_year), 0), 2) as revenue_usd_year,
  round(coalesce(sum(l.price_usd_year), 0) - coalesce(sum(l.cost_usd_year), 0), 2) as margin_usd_year
from public.projects p
left join public.clients c on c.id = p.client_id
left join public.project_line_items l on l.project_id = p.id
where p.deleted_at is null and p.brand is not null
group by p.brand, c.name;
