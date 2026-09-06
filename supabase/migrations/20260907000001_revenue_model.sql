-- =============================================================
-- EJE DE INGRESOS
-- Catálogo de precios, cargos únicos, anualidades ancladas al
-- vencimiento de un activo, y margen por año calendario.
-- =============================================================

-- -------------------------------------------------------------
-- service_catalog: precios de referencia
-- -------------------------------------------------------------

create table public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  concept text not null unique,
  kind text not null default 'recurrente' check (kind in ('recurrente', 'unico')),
  reference_price numeric(12, 2),
  currency text not null default 'USD' check (currency in ('USD', 'UYU')),
  default_frequency text not null default 'anual'
    check (default_frequency in ('mensual', 'trimestral', 'semestral', 'anual')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_catalog_set_updated_at
  before update on public.service_catalog
  for each row execute function public.set_updated_at();

insert into public.service_catalog (concept, kind, reference_price, currency, default_frequency, notes)
values
  ('Anualidad landing', 'recurrente', 160, 'USD', 'anual',
   'Incluye dominio, hosting, SSL, alojamiento y mantenimiento. Se confirma con el cliente 45 días antes del vencimiento del dominio.'),
  ('Desarrollo de landing', 'unico', null, 'USD', 'anual',
   'Cargo único por creación. Precio a definir por proyecto.');

-- -------------------------------------------------------------
-- project_charges: cargos únicos al cliente (ingresos)
-- -------------------------------------------------------------

create table public.project_charges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  concept text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'USD' check (currency in ('USD', 'UYU')),
  charge_date date not null default current_date,
  billing_status text not null default 'pendiente'
    check (billing_status in ('pendiente', 'cobrado')),
  collected_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_charges_project_idx on public.project_charges (project_id);

create trigger project_charges_set_updated_at
  before update on public.project_charges
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- recurring_services: anclaje al activo, confirmación y cobro
-- La fecha de cobro se DERIVA del vencimiento del activo ancla.
-- -------------------------------------------------------------

alter table public.recurring_services
  add column anchor_asset_id uuid references public.assets (id),
  add column lead_days int not null default 45,
  add column confirmation_status text not null default 'pendiente'
    check (confirmation_status in ('pendiente', 'confirmada', 'rechazada')),
  add column confirmed_at date,
  add column billing_status text not null default 'pendiente'
    check (billing_status in ('pendiente', 'cobrado')),
  add column collected_at date,
  add column catalog_id uuid references public.service_catalog (id);

comment on column public.recurring_services.anchor_asset_id is
  'Activo cuyo vencimiento gobierna el ciclo. La fecha de confirmación se deriva de él.';
comment on column public.recurring_services.lead_days is
  'Días antes del vencimiento del ancla en que se pide confirmación al cliente.';

-- -------------------------------------------------------------
-- Fechas derivadas del ancla
-- -------------------------------------------------------------

create or replace view public.service_schedule as
select
  s.id as service_id,
  s.project_id,
  s.concept,
  s.amount,
  s.currency,
  s.net_cost,
  s.net_currency,
  s.frequency,
  s.confirmation_status,
  s.billing_status,
  s.lead_days,
  a.id as anchor_asset_id,
  a.name as anchor_asset,
  a.expires_at as anchor_expires_at,
  -- Si hay ancla, la renovación es su vencimiento; si no, la fecha manual
  coalesce(a.expires_at, s.next_billing_date) as renewal_date,
  -- Confirmación: lead_days antes de la renovación
  coalesce(a.expires_at, s.next_billing_date) - s.lead_days as confirm_by,
  (coalesce(a.expires_at, s.next_billing_date) - s.lead_days) - current_date as days_to_confirm
from public.recurring_services s
left join public.assets a on a.id = s.anchor_asset_id and a.deleted_at is null
where s.active;

-- -------------------------------------------------------------
-- Ingresos por año calendario, en USD
-- -------------------------------------------------------------

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
  where extract(year from c.charge_date)::int = y.yr
),
service_rows as (
  select
    s.project_id,
    y.yr,
    case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end
      * public.payments_in_year(
          coalesce(sc.renewal_date, s.next_billing_date), s.frequency, y.yr
        ) as usd
  from public.recurring_services s
  left join public.service_schedule sc on sc.service_id = s.id
  cross join years y
  cross join rate r
  where s.active
    and s.project_id is not null
    and s.amount is not null
    and s.confirmation_status <> 'rechazada'
)
select project_id, yr as year, round(sum(usd)::numeric, 2) as usd_total
from (select * from charge_rows union all select * from service_rows) t
where project_id is not null
group by project_id, yr;

-- -------------------------------------------------------------
-- Margen: ingreso − costo neto, por proyecto y año
-- -------------------------------------------------------------

create or replace view public.project_margin as
select
  p.id as project_id,
  y.yr as year,
  coalesce(r.usd_total, 0) as revenue_usd,
  coalesce(c.usd_total, 0) as cost_usd,
  round(coalesce(r.usd_total, 0) - coalesce(c.usd_total, 0), 2) as margin_usd,
  case
    when coalesce(r.usd_total, 0) = 0 then null
    else round(((coalesce(r.usd_total, 0) - coalesce(c.usd_total, 0))
                / r.usd_total * 100)::numeric, 1)
  end as margin_pct
from public.projects p
cross join (
  select generate_series(
    extract(year from current_date)::int - 1,
    extract(year from current_date)::int + 3
  ) as yr
) y
left join public.project_annual_revenue r on r.project_id = p.id and r.year = y.yr
left join public.project_annual_costs c on c.project_id = p.id and c.year = y.yr
where p.deleted_at is null;

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------

alter table public.service_catalog enable row level security;
alter table public.project_charges enable row level security;

do $$
declare t text;
begin
  foreach t in array array['service_catalog', 'project_charges'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$$;
