-- =============================================================
-- Nova Tech Hub — Migración inicial del schema
-- 10 tablas + RLS + triggers de auditoría y updated_at
-- Ref: PLAN-MAESTRO.md sección 5
-- =============================================================

-- -------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- profiles (usuarios internos + roles)
-- -------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'operador'
    check (role in ('admin', 'operador', 'lectura')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Alta automática de perfil al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Funciones de rol (security definer para evitar recursión de RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'operador')
  );
$$;

-- -------------------------------------------------------------
-- clients
-- -------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'externo' check (kind in ('interno', 'externo')),
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- projects
-- -------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  name text not null,
  type text not null default 'otro'
    check (type in ('landing', 'ecommerce', 'sistema', 'automatizacion', 'otro')),
  status text not null default 'en_desarrollo'
    check (status in ('presupuestado', 'en_desarrollo', 'activo', 'pausado', 'finalizado', 'archivado')),
  description text,
  production_url text,
  repo_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_client_id_idx on public.projects (client_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- project_tech_profiles (Ficha Técnica 360, 1:1 con projects)
-- -------------------------------------------------------------

create table public.project_tech_profiles (
  project_id uuid primary key references public.projects (id) on delete cascade,
  stack jsonb not null default '{}'::jsonb,
  infrastructure jsonb not null default '{}'::jsonb,
  integrations jsonb not null default '[]'::jsonb,
  technical_decisions text,
  continuation_requirements text,
  credentials_location text, -- DÓNDE están las credenciales, nunca las credenciales
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger project_tech_profiles_set_updated_at
  before update on public.project_tech_profiles
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- assets (activos de Nova, independientes del proyecto)
-- -------------------------------------------------------------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dominio', 'hosting', 'herramienta', 'licencia', 'otro')),
  name text not null,
  provider text,
  identifier text, -- ej: latamnova.app, ref de proyecto supabase
  ownership text not null default 'nova' check (ownership in ('nova', 'cliente')),
  cost numeric(12, 2),
  currency text not null default 'USD' check (currency in ('USD', 'UYU')),
  expires_at date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_expires_at_idx on public.assets (expires_at) where deleted_at is null;

create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- asset_assignments (activo ↔ proyecto, N:M)
-- -------------------------------------------------------------

create table public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  assigned_from date not null default current_date,
  assigned_until date,
  created_at timestamptz not null default now()
);

create index asset_assignments_asset_id_idx on public.asset_assignments (asset_id);
create index asset_assignments_project_id_idx on public.asset_assignments (project_id);

-- -------------------------------------------------------------
-- recurring_services (cobro y vencimiento son fechas distintas)
-- -------------------------------------------------------------

create table public.recurring_services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id),
  client_id uuid references public.clients (id),
  concept text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'USD' check (currency in ('USD', 'UYU')),
  frequency text not null default 'mensual'
    check (frequency in ('mensual', 'trimestral', 'semestral', 'anual')),
  next_billing_date date,
  expires_at date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_services_target_chk
    check (project_id is not null or client_id is not null)
);

create index recurring_services_project_id_idx on public.recurring_services (project_id);
create index recurring_services_client_id_idx on public.recurring_services (client_id);
create index recurring_services_next_billing_idx on public.recurring_services (next_billing_date) where active;

create trigger recurring_services_set_updated_at
  before update on public.recurring_services
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- alerts (idempotentes por origen + umbral + fecha objetivo)
-- -------------------------------------------------------------

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('asset', 'service')),
  asset_id uuid references public.assets (id) on delete cascade,
  service_id uuid references public.recurring_services (id) on delete cascade,
  threshold_days int not null check (threshold_days in (90, 60, 30, 15)),
  due_date date not null,
  suggested_action text,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'vista', 'resuelta', 'pospuesta')),
  snoozed_until date,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint alerts_source_chk check (
    (source_type = 'asset' and asset_id is not null and service_id is null) or
    (source_type = 'service' and service_id is not null and asset_id is null)
  )
);

-- Idempotencia: una sola alerta por origen, umbral y fecha
create unique index alerts_asset_dedupe_idx
  on public.alerts (asset_id, threshold_days, due_date)
  where asset_id is not null;
create unique index alerts_service_dedupe_idx
  on public.alerts (service_id, threshold_days, due_date)
  where service_id is not null;
create index alerts_status_idx on public.alerts (status) where status = 'pendiente';

-- -------------------------------------------------------------
-- project_events (historial por proyecto)
-- -------------------------------------------------------------

create table public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  event_type text not null,
  description text,
  author uuid references public.profiles (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index project_events_project_id_idx on public.project_events (project_id, created_at desc);

-- Auditoría automática: creación y cambios de estado de proyectos
create or replace function public.log_project_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_events (project_id, event_type, description, author, metadata)
    values (new.id, 'creacion', 'Proyecto creado: ' || new.name, auth.uid(),
            jsonb_build_object('status', new.status));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.project_events (project_id, event_type, description, author, metadata)
    values (new.id, 'cambio_estado',
            'Estado: ' || old.status || ' → ' || new.status, auth.uid(),
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

create trigger projects_log_event
  after insert or update on public.projects
  for each row execute function public.log_project_event();

-- -------------------------------------------------------------
-- documents (metadatos; el binario vive en Storage)
-- -------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('client', 'project', 'asset', 'service')),
  entity_id uuid not null,
  name text not null,
  storage_path text not null,
  doc_type text,
  version int not null default 1,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index documents_entity_idx on public.documents (entity_type, entity_id);

-- -------------------------------------------------------------
-- RLS: lectura para todo usuario autenticado; escritura para
-- admin/operador; borrado solo admin. Anónimos sin acceso.
-- -------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_tech_profiles enable row level security;
alter table public.assets enable row level security;
alter table public.asset_assignments enable row level security;
alter table public.recurring_services enable row level security;
alter table public.alerts enable row level security;
alter table public.project_events enable row level security;
alter table public.documents enable row level security;

-- profiles: cada uno ve todo, edita el suyo; admin edita cualquiera
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_all" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Resto de tablas: patrón uniforme
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'projects', 'project_tech_profiles', 'assets',
    'asset_assignments', 'recurring_services', 'alerts',
    'project_events', 'documents'
  ]
  loop
    execute format(
      'create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
    execute format(
      'create policy "%1$s_update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$$;
