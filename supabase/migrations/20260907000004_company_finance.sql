-- =============================================================
-- FINANZAS DE NOVA
-- Métodos de pago como entidad, dirección (ingreso/egreso),
-- alcance (proyecto/empresa), categorías y vistas por período.
--
-- Nunca se almacenan números completos de tarjeta ni cuenta:
-- sólo etiqueta, institución y últimos cuatro dígitos.
-- =============================================================

-- -------------------------------------------------------------
-- payment_methods
-- -------------------------------------------------------------

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,              -- "BBVA Visa ····2014"
  kind text not null default 'tarjeta'
    check (kind in ('tarjeta', 'cuenta_bancaria', 'paypal', 'efectivo', 'transferencia', 'otro')),
  institution text,                        -- BBVA, Antel, PayPal
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  currency text not null default 'USD' check (currency in ('USD', 'UYU')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_methods is
  'Medios de pago de Nova. SOLO últimos cuatro dígitos: nunca el número completo, CVV ni vencimiento.';

create trigger payment_methods_set_updated_at
  before update on public.payment_methods
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- expense_categories
-- -------------------------------------------------------------

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

insert into public.expense_categories (name, sort_order) values
  ('Constitución y sociedad', 10),
  ('Contable y legal', 20),
  ('Herramientas y software', 30),
  ('Infraestructura y dominios', 40),
  ('Bancario y financiero', 50),
  ('Marketing y eventos', 60),
  ('Otros', 90);

-- -------------------------------------------------------------
-- Movimientos únicos: dirección, alcance, categoría y método
-- project_id pasa a ser opcional: los gastos de estructura no
-- pertenecen a ningún proyecto.
-- -------------------------------------------------------------

alter table public.project_charges
  alter column project_id drop not null;

alter table public.project_charges
  add column direction text not null default 'ingreso'
    check (direction in ('ingreso', 'egreso')),
  add column scope text not null default 'proyecto'
    check (scope in ('proyecto', 'empresa')),
  add column category_id uuid references public.expense_categories (id),
  add column payment_method_id uuid references public.payment_methods (id),
  add column client_id uuid references public.clients (id);

comment on table public.project_charges is
  'Movimientos únicos. direction: ingreso o egreso. scope: proyecto o empresa (overhead).';

alter table public.project_charges
  add constraint charges_scope_chk check (
    (scope = 'proyecto' and project_id is not null) or (scope = 'empresa')
  );

create index charges_scope_idx on public.project_charges (scope, direction, charge_date);

-- -------------------------------------------------------------
-- Recurrentes: mismos ejes
-- -------------------------------------------------------------

alter table public.recurring_services
  add column direction text not null default 'ingreso'
    check (direction in ('ingreso', 'egreso')),
  add column scope text not null default 'proyecto'
    check (scope in ('proyecto', 'empresa')),
  add column category_id uuid references public.expense_categories (id),
  add column payment_method_id uuid references public.payment_methods (id),
  add column payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente', 'pagado')),
  add column paid_at date;

comment on column public.recurring_services.payment_status is
  'Para egresos: estado de pago. Los ingresos usan billing_status.';

-- El constraint original exigía proyecto o cliente; el overhead no tiene ninguno
alter table public.recurring_services
  drop constraint if exists recurring_services_target_chk;

alter table public.recurring_services
  add constraint recurring_services_target_chk check (
    scope = 'empresa' or project_id is not null or client_id is not null
  );

-- -------------------------------------------------------------
-- Método de pago por defecto del proveedor: se hereda al crear
-- -------------------------------------------------------------

alter table public.providers
  add column payment_method_id uuid references public.payment_methods (id);

alter table public.assets
  add column payment_method_id uuid references public.payment_methods (id);

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------

alter table public.payment_methods enable row level security;
alter table public.expense_categories enable row level security;

do $$
declare t text;
begin
  foreach t in array array['payment_methods', 'expense_categories'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$$;
