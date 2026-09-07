-- =============================================================
-- COLABORADORES, ASIGNACIONES Y HORAS
--
-- Nova factura al cliente una tarifa y le paga al colaborador otra
-- menor: esa diferencia es su rentabilidad. Los socios trabajan como
-- colaboradores y cobran por su trabajo, independientemente del
-- aporte de capital, que es otra cosa y vive en partners.
--
-- Un proyecto puede repartirse de dos formas a la vez:
--   por horas       -> tarifa x horas registradas
--   por entregable  -> monto fijo, sin importar cuánto lleve
-- =============================================================

create table public.collaborators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'externo'
    check (kind in ('socio', 'interno', 'externo')),
  partner_id uuid references public.partners (id),
  default_hourly_cost numeric(12, 2),
  currency text not null default 'USD' check (currency in ('USD', 'UYU', 'BRL')),
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.collaborators.default_hourly_cost is
  'Lo que Nova le paga por hora. Distinto de la tarifa que Nova cobra al cliente.';
comment on column public.collaborators.partner_id is
  'Si el colaborador es socio, su vínculo. El trabajo se paga aparte del aporte de capital.';

create trigger collaborators_set_updated_at
  before update on public.collaborators
  for each row execute function public.set_updated_at();

insert into public.collaborators (name, kind, partner_id, notes)
select p.name, 'socio', p.id, 'Tarifa por hora a definir.'
from public.partners p
where p.active
on conflict (name) do nothing;

-- -------------------------------------------------------------
-- Tarifa al cliente: por proyecto, cada caso se negocia distinto
-- -------------------------------------------------------------

alter table public.projects
  add column client_hourly_rate numeric(12, 2),
  add column rate_currency text default 'USD'
    check (rate_currency in ('USD', 'UYU', 'BRL'));

comment on column public.projects.client_hourly_rate is
  'Tarifa por hora que Nova cobra al cliente en este proyecto. Se negocia caso por caso.';

-- -------------------------------------------------------------
-- Asignaciones de trabajo
-- -------------------------------------------------------------

create table public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  collaborator_id uuid not null references public.collaborators (id),
  title text not null,
  mode text not null default 'horas' check (mode in ('horas', 'entregable')),
  hourly_cost numeric(12, 2),
  estimated_hours numeric(8, 2),
  fixed_cost numeric(12, 2),
  currency text not null default 'USD' check (currency in ('USD', 'UYU', 'BRL')),
  status text not null default 'en_curso'
    check (status in ('en_curso', 'entregado', 'cancelado')),
  payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente', 'pagado')),
  paid_at date,
  payment_method_id uuid references public.payment_methods (id),
  started_on date default current_date,
  delivered_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_mode_chk check (
    (mode = 'horas' and hourly_cost is not null) or
    (mode = 'entregable' and fixed_cost is not null)
  )
);

create index work_assignments_project_idx on public.work_assignments (project_id);
create index work_assignments_collaborator_idx on public.work_assignments (collaborator_id);

create trigger work_assignments_set_updated_at
  before update on public.work_assignments
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- Registro de horas: solo para asignaciones por horas
-- -------------------------------------------------------------

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.work_assignments (id) on delete cascade,
  worked_on date not null default current_date,
  hours numeric(6, 2) not null check (hours > 0 and hours <= 24),
  description text,
  created_at timestamptz not null default now()
);

create index time_entries_assignment_idx on public.time_entries (assignment_id, worked_on);

-- -------------------------------------------------------------
-- Costo real de cada asignación
-- -------------------------------------------------------------

create or replace view public.assignment_summary as
select
  w.id as assignment_id,
  w.project_id,
  w.collaborator_id,
  c.name as collaborator_name,
  c.kind as collaborator_kind,
  w.title,
  w.mode,
  w.status,
  w.payment_status,
  w.currency,
  w.estimated_hours,
  coalesce(sum(t.hours), 0) as worked_hours,
  w.hourly_cost,
  w.fixed_cost,
  case
    when w.mode = 'horas' then round((coalesce(sum(t.hours), 0) * w.hourly_cost)::numeric, 2)
    else w.fixed_cost
  end as cost_amount,
  public.to_usd(
    case
      when w.mode = 'horas' then coalesce(sum(t.hours), 0) * w.hourly_cost
      else w.fixed_cost
    end,
    w.currency
  ) as cost_usd,
  case
    when w.mode = 'horas' and coalesce(w.estimated_hours, 0) > 0
      then round((coalesce(sum(t.hours), 0) - w.estimated_hours)::numeric, 2)
    else null
  end as hours_deviation
from public.work_assignments w
join public.collaborators c on c.id = w.collaborator_id
left join public.time_entries t on t.assignment_id = w.id
where w.status <> 'cancelado'
group by w.id, c.name, c.kind;

-- -------------------------------------------------------------
-- Rentabilidad del trabajo por proyecto
-- -------------------------------------------------------------

create or replace view public.project_work_summary as
select
  p.id as project_id,
  p.client_hourly_rate,
  p.rate_currency,
  count(distinct a.assignment_id) as assignments_count,
  count(distinct a.collaborator_id) as collaborators_count,
  round(coalesce(sum(a.worked_hours), 0), 2) as worked_hours,
  round(coalesce(sum(a.estimated_hours), 0), 2) as estimated_hours,
  round(coalesce(sum(a.cost_usd), 0), 2) as work_cost_usd,
  round(
    coalesce(sum(a.worked_hours), 0)
      * public.to_usd(p.client_hourly_rate, coalesce(p.rate_currency, 'USD')), 2
  ) as billable_usd,
  round(coalesce(sum(a.cost_usd) filter (where a.payment_status = 'pendiente'), 0), 2)
    as unpaid_usd
from public.projects p
left join public.assignment_summary a on a.project_id = p.id
where p.deleted_at is null
group by p.id;

-- -------------------------------------------------------------
-- Cuánto le debe Nova a cada colaborador
-- -------------------------------------------------------------

create or replace view public.collaborator_account as
select
  c.id as collaborator_id,
  c.name,
  c.kind,
  c.active,
  count(distinct a.assignment_id) as assignments_count,
  round(coalesce(sum(a.worked_hours), 0), 2) as worked_hours,
  round(coalesce(sum(a.cost_usd), 0), 2) as earned_usd,
  round(coalesce(sum(a.cost_usd) filter (where a.payment_status = 'pagado'), 0), 2)
    as paid_usd,
  round(coalesce(sum(a.cost_usd) filter (where a.payment_status = 'pendiente'), 0), 2)
    as pending_usd
from public.collaborators c
left join public.assignment_summary a on a.collaborator_id = c.id
group by c.id;

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------

alter table public.collaborators enable row level security;
alter table public.work_assignments enable row level security;
alter table public.time_entries enable row level security;

do $rls$
declare t text;
begin
  foreach t in array array['collaborators', 'work_assignments', 'time_entries'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$rls$;
