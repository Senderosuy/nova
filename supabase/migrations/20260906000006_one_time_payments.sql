-- =============================================================
-- Pagos únicos: fecha de pago y su impacto en el año calendario
-- =============================================================

alter table public.assets
  add column paid_at date;

comment on column public.assets.paid_at is
  'Fecha en que se pagó. Para billing_cycle = ''unico'' define en qué año calendario impacta el costo.';

-- Un pago único cuenta una sola vez, en el año de su fecha de pago
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
  if cycle = 'unico' then
    -- Se paga una vez: impacta sólo el año de la fecha
    if anchor is not null and extract(year from anchor)::int = yr then
      return 1;
    end if;
    return 0;
  end if;

  if step = 0 then
    return 0;                       -- 'gratis' no tiene costo
  end if;

  if anchor is null then
    return 12 / step;
  end if;

  select count(*)
  into n
  from generate_series(-40, 40) k
  where (anchor + (k * step || ' months')::interval)::date between y_start and y_end;

  return n;
end;
$$;

-- La vista usa paid_at como ancla cuando el ciclo es único
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
      * public.payments_in_year(
          case when a.billing_cycle = 'unico' then a.paid_at else a.expires_at end,
          a.billing_cycle, y.yr
        ) as usd
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
