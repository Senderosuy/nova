-- =============================================================
-- Costo por AÑO CALENDARIO, expresado en USD
-- Proyecta los pagos reales de cada activo/servicio según su
-- ciclo y su fecha de renovación, y cuenta los que caen en el año.
-- =============================================================

-- -------------------------------------------------------------
-- Configuración: tipo de cambio editable
-- -------------------------------------------------------------

create table public.app_settings (
  key text primary key,
  value numeric not null,
  label text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, label) values
  ('usd_uyu_rate', 40.243, 'Cotización UYU por USD (BCU, cierre 04/09/2026)');

alter table public.app_settings enable row level security;
create policy "app_settings_select" on public.app_settings
  for select to authenticated using (true);
create policy "app_settings_update" on public.app_settings
  for update to authenticated using (public.can_write()) with check (public.can_write());

-- -------------------------------------------------------------
-- Meses entre pagos según el ciclo (0 = no recurrente)
-- -------------------------------------------------------------

create or replace function public.cycle_months(cycle text)
returns int
language sql
immutable
as $$
  select case cycle
    when 'mensual' then 1
    when 'trimestral' then 3
    when 'semestral' then 6
    when 'anual' then 12
    else 0
  end;
$$;

-- -------------------------------------------------------------
-- Cuántos pagos caen dentro del año calendario dado.
-- Proyecta hacia atrás y adelante desde la fecha de renovación.
-- Sin fecha conocida, asume que el ciclo corre todo el año.
-- -------------------------------------------------------------

create or replace function public.payments_in_year(
  anchor date,
  cycle text,
  yr int
)
returns int
language plpgsql
immutable
as $$
declare
  step int := public.cycle_months(cycle);
  y_start date := make_date(yr, 1, 1);
  y_end date := make_date(yr, 12, 31);
  n int;
begin
  if step = 0 then
    return 0;                       -- 'unico' y 'gratis' no son recurrentes
  end if;

  if anchor is null then
    return 12 / step;               -- sin ancla: ciclo completo dentro del año
  end if;

  -- Cuenta los múltiplos del ciclo, desde el ancla, que caen en el año
  select count(*)
  into n
  from generate_series(-40, 40) k
  where (anchor + (k * step || ' months')::interval)::date between y_start and y_end;

  return n;
end;
$$;

-- -------------------------------------------------------------
-- Vista: costo neto por proyecto y año calendario, en USD
-- -------------------------------------------------------------

create or replace view public.project_annual_costs as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
years as (
  select generate_series(
    extract(year from current_date)::int - 1,
    extract(year from current_date)::int + 3
  ) as yr
),
asset_rows as (
  select
    aa.project_id,
    y.yr,
    case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end
      * public.payments_in_year(a.expires_at, a.billing_cycle, y.yr) as usd
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  cross join years y
  cross join rate r
  where aa.assigned_until is null
    and a.deleted_at is null
    and a.cost is not null
),
service_rows as (
  select
    s.project_id,
    y.yr,
    case when s.net_currency = 'UYU' then s.net_cost / r.usd_uyu else s.net_cost end
      * public.payments_in_year(
          coalesce(s.next_billing_date, s.expires_at), s.frequency, y.yr
        ) as usd
  from public.recurring_services s
  cross join years y
  cross join rate r
  where s.active
    and s.project_id is not null
    and s.net_cost is not null
)
select project_id, yr as year, round(sum(usd)::numeric, 2) as usd_total
from (
  select * from asset_rows
  union all
  select * from service_rows
) t
where project_id is not null
group by project_id, yr;
