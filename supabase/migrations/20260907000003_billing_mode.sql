-- =============================================================
-- Modalidad de cobro: adelantado vs vencido
--
-- Adelantado: se cobra el período por comenzar. El primer cobro
--   ocurre junto con la primera renovación.
-- Vencido: se cobra el período ya transcurrido. El primer cobro
--   ocurre recién en la renovación siguiente, no antes.
--
-- Caso real: las landings existentes no cobraron el primer año,
-- así que su anualidad 2026/2027 se cobra en 2027. Sin esto, el
-- margen de 2026 mostraría un ingreso inexistente.
-- =============================================================

alter table public.recurring_services
  add column billing_mode text not null default 'adelantado'
    check (billing_mode in ('adelantado', 'vencido')),
  add column first_charge_date date;

comment on column public.recurring_services.billing_mode is
  'adelantado: se cobra el período por comenzar. vencido: se cobra el período transcurrido, el primer cobro cae una renovación después.';
comment on column public.recurring_services.first_charge_date is
  'Fecha del primer cobro efectivo. Los años anteriores no computan ingreso. Si es null y el modo es vencido, se deriva de la próxima renovación.';

-- -------------------------------------------------------------
-- Pagos en un año, acotados por una fecha de inicio.
-- No cuenta cobros anteriores al primer cobro efectivo.
-- -------------------------------------------------------------

create or replace function public.payments_in_year_from(
  anchor date,
  cycle text,
  yr int,
  starts_on date
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
    if anchor is not null and extract(year from anchor)::int = yr then
      return 1;
    end if;
    return 0;
  end if;

  if step = 0 then
    return 0;
  end if;

  if anchor is null then
    return 12 / step;
  end if;

  select count(*)
  into n
  from generate_series(-40, 40) k
  where (anchor + (k * step || ' months')::interval)::date between y_start and y_end
    and (starts_on is null
         or (anchor + (k * step || ' months')::interval)::date >= starts_on);

  return n;
end;
$$;

-- -------------------------------------------------------------
-- El calendario del servicio ahora expone el primer cobro efectivo
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
  coalesce(a.expires_at, s.next_billing_date) as renewal_date,
  coalesce(a.expires_at, s.next_billing_date) - s.lead_days as confirm_by,
  (coalesce(a.expires_at, s.next_billing_date) - s.lead_days) - current_date as days_to_confirm,
  -- Columnas nuevas al final: create or replace no permite intercalarlas
  s.billing_mode,
  -- Primer cobro efectivo: explícito, o derivado del modo
  coalesce(
    s.first_charge_date,
    case
      when s.billing_mode = 'vencido'
        then coalesce(a.expires_at, s.next_billing_date)
      else null
    end
  ) as effective_first_charge
from public.recurring_services s
left join public.assets a on a.id = s.anchor_asset_id and a.deleted_at is null
where s.active;

-- -------------------------------------------------------------
-- Ingresos: no computar cobros previos al primer cobro efectivo
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
      * public.payments_in_year_from(
          coalesce(sc.renewal_date, s.next_billing_date),
          s.frequency,
          y.yr,
          sc.effective_first_charge
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
