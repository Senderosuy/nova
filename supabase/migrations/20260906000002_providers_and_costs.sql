-- =============================================================
-- Proveedores, costos netos y rollup de costo por proyecto
-- =============================================================

-- -------------------------------------------------------------
-- providers: a quién le contratamos y en qué condiciones
-- -------------------------------------------------------------

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text,
  category text not null default 'otro'
    check (category in ('dominios', 'hosting', 'cdn', 'productividad', 'infraestructura', 'otro')),
  contract_context text,              -- qué le contratamos y para qué
  billing_model text not null default 'pago'
    check (billing_model in ('pago', 'free', 'freemium')),
  payment_method text,                -- "cuenta Antel 13042346000220", "tarjeta ...4417"
  payment_terms text,                 -- ciclo, moneda de cobro, notas de facturación
  account_reference text,             -- identificador de la cuenta en el proveedor
  currency text not null default 'USD' check (currency in ('USD', 'UYU')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

alter table public.providers enable row level security;

create policy "providers_select" on public.providers
  for select to authenticated using (true);
create policy "providers_insert" on public.providers
  for insert to authenticated with check (public.can_write());
create policy "providers_update" on public.providers
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy "providers_delete" on public.providers
  for delete to authenticated using (public.is_admin());

-- -------------------------------------------------------------
-- assets: costo NETO de Nova, ciclo y vínculo a proveedor
-- El costo neto es interno: nunca se expone al cliente.
-- -------------------------------------------------------------

alter table public.assets
  add column provider_id uuid references public.providers (id),
  add column billing_cycle text not null default 'anual'
    check (billing_cycle in ('mensual', 'trimestral', 'semestral', 'anual', 'unico', 'gratis'));

comment on column public.assets.cost is
  'Costo NETO de Nova por ciclo. Interno: no se informa al cliente.';

-- -------------------------------------------------------------
-- recurring_services: separar costo neto de precio al cliente
-- -------------------------------------------------------------

alter table public.recurring_services
  add column provider_id uuid references public.providers (id),
  add column net_cost numeric(12, 2),
  add column net_currency text not null default 'USD'
    check (net_currency in ('USD', 'UYU'));

comment on column public.recurring_services.amount is
  'Precio facturado AL CLIENTE.';
comment on column public.recurring_services.net_cost is
  'Costo NETO de Nova por el mismo ciclo. Interno: nunca se informa al cliente.';

-- -------------------------------------------------------------
-- Normalización de costos a mensual / anual
-- -------------------------------------------------------------

create or replace function public.to_monthly(amount numeric, cycle text)
returns numeric
language sql
immutable
as $$
  select case
    when amount is null then 0
    when cycle = 'mensual' then amount
    when cycle = 'trimestral' then amount / 3
    when cycle = 'semestral' then amount / 6
    when cycle = 'anual' then amount / 12
    else 0  -- 'unico' y 'gratis' no son costo recurrente
  end;
$$;

-- -------------------------------------------------------------
-- Vista: costo neto por proyecto, mensual y anual, por moneda.
-- Suma activos vigentes asignados + servicios recurrentes activos.
-- -------------------------------------------------------------

create or replace view public.project_costs as
with asset_costs as (
  select
    aa.project_id,
    a.currency,
    public.to_monthly(a.cost, a.billing_cycle) as monthly
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  where aa.assigned_until is null
    and a.deleted_at is null
),
service_costs as (
  select
    s.project_id,
    s.net_currency as currency,
    public.to_monthly(s.net_cost, s.frequency) as monthly
  from public.recurring_services s
  where s.active and s.project_id is not null
),
combined as (
  select * from asset_costs
  union all
  select * from service_costs
)
select
  project_id,
  currency,
  round(sum(monthly), 2) as net_monthly,
  round(sum(monthly) * 12, 2) as net_yearly
from combined
where project_id is not null
group by project_id, currency;

-- -------------------------------------------------------------
-- Seed de proveedores actuales + backfill de activos existentes
-- -------------------------------------------------------------

insert into public.providers
  (name, website, category, contract_context, billing_model, payment_method, payment_terms, account_reference, currency)
values
  ('nic.com.uy', 'https://nic.com.uy', 'dominios',
   'Registro y renovación de dominios .uy y .com.uy de Nova y sus clientes.',
   'pago', 'Débito en cuenta Antel', 'Renovación automática anual por dominio.',
   'Cuenta Antel 13042346000220 · tel. 29088302', 'UYU'),
  ('Hostinger', 'https://hostinger.com', 'hosting',
   'Registro de dominios genéricos (.com, .app, .wine) y hosting web.',
   'pago', 'Tarjeta registrada en hPanel', 'Renovación automática según ciclo de cada servicio.',
   null, 'USD'),
  ('Cloudflare', 'https://cloudflare.com', 'cdn',
   'DNS, CDN y capa de seguridad para los sitios de Nova y clientes.',
   'freemium', null, 'Plan gratuito por defecto; upgrades puntuales según proyecto.',
   null, 'USD'),
  ('Google Workspace', 'https://workspace.google.com', 'productividad',
   'Correo corporativo y suite de productividad para Nova y clientes.',
   'pago', null, 'Suscripción por usuario, ciclo mensual o anual.',
   null, 'USD')
on conflict (name) do nothing;

-- Vincular activos existentes a su proveedor y fijar el costo neto de los .uy
update public.assets a
set provider_id = p.id
from public.providers p
where a.provider = p.name and a.provider_id is null;

update public.assets
set cost = 948, currency = 'UYU', billing_cycle = 'anual'
where provider = 'nic.com.uy' and cost is null;
