-- =============================================================
-- MONITOREO DE DISPONIBILIDAD
--
-- Los sitios que Nova construye y sostiene. Si se cae uno, hay que
-- enterarse ya: para un e-commerce una hora caído es plata perdida.
--
-- No genera informes: genera alarmas. El éxito es que nunca
-- aparezca nada.
--
-- Lógica de confirmación, para no alertar por microcortes:
--   chequeo OK    -> nada
--   chequeo FALLA -> reintento a los 3 minutos
--                    OK    -> fue un microcorte, no se alerta
--                    FALLA -> alerta de sitio caído
--
-- Se guardan CAMBIOS DE ESTADO, no cada chequeo: un sitio cada 5
-- minutos generaría 105.000 filas al año sin aportar nada.
-- =============================================================

create extension if not exists pg_net with schema extensions;

create table public.site_monitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  label text not null,
  url text not null,
  -- Cada cuánto se chequea. Un e-commerce con campaña: 5. Una landing: 720.
  interval_minutes int not null default 720 check (interval_minutes >= 1),
  criticality text not null default 'normal'
    check (criticality in ('critico', 'normal', 'bajo')),
  timeout_seconds int not null default 10,
  -- Estado vigente
  status text not null default 'sin_datos'
    check (status in ('sin_datos', 'ok', 'sospecha', 'caido')),
  last_checked_at timestamptz,
  last_ok_at timestamptz,
  last_status_code int,
  last_error text,
  -- Cuándo se debe reintentar tras una falla, y cuándo toca el próximo ciclo
  retry_at timestamptz,
  next_check_at timestamptz default now(),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (url)
);

comment on column public.site_monitors.status is
  'sospecha = falló una vez y espera el reintento de confirmación. caido = confirmado.';
comment on column public.site_monitors.interval_minutes is
  'Frecuencia de chequeo. La criticidad del negocio la define, no un nivel fijo.';

create index site_monitors_due_idx on public.site_monitors (next_check_at)
  where active;

create trigger site_monitors_set_updated_at
  before update on public.site_monitors
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- Solo los cambios de estado, con su duración
-- -------------------------------------------------------------

create table public.monitor_events (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.site_monitors (id) on delete cascade,
  event text not null check (event in ('caida', 'recuperacion')),
  occurred_at timestamptz not null default now(),
  status_code int,
  error text,
  -- En una recuperación: cuánto duró la caída
  downtime_minutes int,
  created_at timestamptz not null default now()
);

create index monitor_events_monitor_idx on public.monitor_events (monitor_id, occurred_at desc);

-- -------------------------------------------------------------
-- Resumen diario: disponibilidad sin guardar cada chequeo
-- -------------------------------------------------------------

create table public.monitor_daily (
  monitor_id uuid not null references public.site_monitors (id) on delete cascade,
  day date not null,
  checks int not null default 0,
  failures int not null default 0,
  downtime_minutes int not null default 0,
  primary key (monitor_id, day)
);

-- -------------------------------------------------------------
-- Registrar el resultado de un chequeo y decidir qué sigue
--
-- Es la única puerta de entrada: concentra la lógica de confirmación
-- para que el endpoint solo tenga que reportar qué vio.
-- -------------------------------------------------------------

create or replace function public.record_check(
  p_monitor_id uuid,
  p_ok boolean,
  p_status_code int default null,
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  result text;
  down_min int;
begin
  select * into m from public.site_monitors where id = p_monitor_id;
  if not found then return 'monitor inexistente'; end if;

  -- Contabilidad del día
  insert into public.monitor_daily (monitor_id, day, checks, failures)
  values (p_monitor_id, current_date, 1, case when p_ok then 0 else 1 end)
  on conflict (monitor_id, day) do update
    set checks = monitor_daily.checks + 1,
        failures = monitor_daily.failures + case when p_ok then 0 else 1 end;

  if p_ok then
    -- Si venía caído, esto es una recuperación
    if m.status = 'caido' then
      down_min := greatest(
        extract(epoch from (now() - coalesce(m.last_ok_at, now()))) / 60, 0
      )::int;

      insert into public.monitor_events (monitor_id, event, status_code, downtime_minutes)
      values (p_monitor_id, 'recuperacion', p_status_code, down_min);

      update public.monitor_daily
      set downtime_minutes = downtime_minutes + down_min
      where monitor_id = p_monitor_id and day = current_date;

      result := 'recuperado';
    else
      result := 'ok';
    end if;

    update public.site_monitors
    set status = 'ok',
        last_checked_at = now(),
        last_ok_at = now(),
        last_status_code = p_status_code,
        last_error = null,
        retry_at = null,
        next_check_at = now() + (m.interval_minutes || ' minutes')::interval
    where id = p_monitor_id;

  else
    if m.status in ('ok', 'sin_datos') then
      -- Primera falla: no se alerta todavía, se confirma en 3 minutos
      update public.site_monitors
      set status = 'sospecha',
          last_checked_at = now(),
          last_status_code = p_status_code,
          last_error = p_error,
          retry_at = now() + interval '3 minutes',
          next_check_at = now() + interval '3 minutes'
      where id = p_monitor_id;
      result := 'sospecha';

    elsif m.status = 'sospecha' then
      -- Segunda falla consecutiva: caída confirmada
      insert into public.monitor_events (monitor_id, event, status_code, error)
      values (p_monitor_id, 'caida', p_status_code, p_error);

      update public.site_monitors
      set status = 'caido',
          last_checked_at = now(),
          last_status_code = p_status_code,
          last_error = p_error,
          retry_at = null,
          next_check_at = now() + (least(m.interval_minutes, 15) || ' minutes')::interval
      where id = p_monitor_id;
      result := 'caido';

    else
      -- Ya estaba caído: se sigue chequeando para detectar la vuelta
      update public.site_monitors
      set last_checked_at = now(),
          last_status_code = p_status_code,
          last_error = p_error,
          next_check_at = now() + (least(m.interval_minutes, 15) || ' minutes')::interval
      where id = p_monitor_id;
      result := 'sigue caido';
    end if;
  end if;

  return result;
end;
$$;

-- -------------------------------------------------------------
-- Estado actual para la interfaz
-- -------------------------------------------------------------

create or replace view public.monitor_status as
select
  m.id as monitor_id,
  m.project_id,
  p.name as project_name,
  c.name as client_name,
  m.label,
  m.url,
  m.status,
  m.criticality,
  m.interval_minutes,
  m.last_checked_at,
  m.last_ok_at,
  m.last_status_code,
  m.last_error,
  m.active,
  -- Hace cuánto está caído
  case when m.status = 'caido'
    then (extract(epoch from (now() - coalesce(m.last_ok_at, m.last_checked_at))) / 60)::int
  end as down_minutes,
  -- Disponibilidad de los últimos 30 días
  (select case when sum(d.checks) > 0
     then round(100.0 * (sum(d.checks) - sum(d.failures)) / sum(d.checks), 2)
   end
   from public.monitor_daily d
   where d.monitor_id = m.id and d.day >= current_date - 30) as uptime_30d,
  (select count(*) from public.monitor_events e
   where e.monitor_id = m.id and e.event = 'caida'
     and e.occurred_at >= current_date - 30) as outages_30d
from public.site_monitors m
left join public.projects p on p.id = m.project_id and p.deleted_at is null
left join public.clients c on c.id = p.client_id;

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------

alter table public.site_monitors enable row level security;
alter table public.monitor_events enable row level security;
alter table public.monitor_daily enable row level security;

do $rls$
declare t text;
begin
  foreach t in array array['site_monitors', 'monitor_events', 'monitor_daily'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$rls$;
