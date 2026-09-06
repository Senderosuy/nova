-- =============================================================
-- Movimientos unificados y vistas por período (mes y año)
-- =============================================================

-- -------------------------------------------------------------
-- cash_movements: toda la plata que entra o sale, en una sola vista.
-- Une movimientos únicos, recurrentes proyectados y costos de activos.
-- Un renglón por ocurrencia, con su fecha real.
-- -------------------------------------------------------------

create or replace view public.cash_movements as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
horizon as (
  select generate_series(
    date_trunc('year', current_date - interval '1 year')::date,
    date_trunc('year', current_date + interval '3 years')::date,
    interval '1 month'
  )::date as month_start
),

-- 1. Movimientos únicos (ingresos y egresos, de proyecto o empresa)
one_off as (
  select
    c.id::text as source_id,
    'unico' as source_kind,
    c.direction,
    c.scope,
    c.project_id,
    c.category_id,
    c.payment_method_id,
    c.concept,
    c.charge_date as occurred_on,
    case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end as usd,
    c.billing_status as status
  from public.project_charges c
  cross join rate r
),

-- 2. Recurrentes proyectados a cada ocurrencia dentro del horizonte
recurring as (
  select
    s.id::text as source_id,
    'recurrente' as source_kind,
    s.direction,
    s.scope,
    s.project_id,
    s.category_id,
    s.payment_method_id,
    s.concept,
    h.month_start as occurred_on,
    case
      when s.direction = 'ingreso'
        then case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end
      else case when s.net_currency = 'UYU' then coalesce(s.net_cost, 0) / r.usd_uyu
                else coalesce(s.net_cost, 0) end
    end as usd,
    case when s.direction = 'ingreso' then s.billing_status else s.payment_status end as status
  from public.recurring_services s
  cross join rate r
  cross join horizon h
  left join public.service_schedule sc on sc.service_id = s.id
  where s.active
    and s.confirmation_status <> 'rechazada'
    -- una ocurrencia por ciclo, alineada al mes de la renovación
    and public.cycle_months(s.frequency) > 0
    and mod(
      abs(
        (extract(year from h.month_start)::int * 12 + extract(month from h.month_start)::int)
        - (extract(year from coalesce(sc.renewal_date, s.next_billing_date, current_date))::int * 12
           + extract(month from coalesce(sc.renewal_date, s.next_billing_date, current_date))::int)
      ),
      public.cycle_months(s.frequency)
    ) = 0
    -- no computar cobros previos al primer cobro efectivo
    and (sc.effective_first_charge is null
         or h.month_start >= date_trunc('month', sc.effective_first_charge)::date)
),

-- 3. Costos de activos asignados a proyectos (egresos)
asset_costs as (
  select
    a.id::text as source_id,
    'activo' as source_kind,
    'egreso' as direction,
    'proyecto' as scope,
    aa.project_id,
    null::uuid as category_id,
    a.payment_method_id,
    a.name as concept,
    h.month_start as occurred_on,
    case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end as usd,
    'pendiente' as status
  from public.assets a
  join public.asset_assignments aa on aa.asset_id = a.id and aa.assigned_until is null
  cross join rate r
  cross join horizon h
  where a.deleted_at is null
    and a.cost is not null
    and (
      (a.billing_cycle = 'unico' and a.paid_at is not null
       and date_trunc('month', a.paid_at)::date = h.month_start)
      or (
        public.cycle_months(a.billing_cycle) > 0
        and a.expires_at is not null
        and mod(
          abs(
            (extract(year from h.month_start)::int * 12 + extract(month from h.month_start)::int)
            - (extract(year from a.expires_at)::int * 12 + extract(month from a.expires_at)::int)
          ),
          public.cycle_months(a.billing_cycle)
        ) = 0
      )
    )
)

select * from one_off
union all
select * from recurring
union all
select * from asset_costs;

-- -------------------------------------------------------------
-- Resultado por mes: ingresos, egresos y neto, separando
-- lo atribuible a proyectos del overhead de empresa.
-- -------------------------------------------------------------

create or replace view public.finance_monthly as
select
  date_trunc('month', occurred_on)::date as period,
  round(sum(usd) filter (where direction = 'ingreso'), 2) as revenue_usd,
  round(sum(usd) filter (where direction = 'egreso'), 2) as expense_usd,
  round(sum(usd) filter (where direction = 'egreso' and scope = 'empresa'), 2) as overhead_usd,
  round(sum(usd) filter (where direction = 'egreso' and scope = 'proyecto'), 2) as project_cost_usd,
  round(
    coalesce(sum(usd) filter (where direction = 'ingreso'), 0)
    - coalesce(sum(usd) filter (where direction = 'egreso'), 0), 2
  ) as net_usd
from public.cash_movements
group by 1;

create or replace view public.finance_yearly as
select
  extract(year from occurred_on)::int as year,
  round(sum(usd) filter (where direction = 'ingreso'), 2) as revenue_usd,
  round(sum(usd) filter (where direction = 'egreso'), 2) as expense_usd,
  round(sum(usd) filter (where direction = 'egreso' and scope = 'empresa'), 2) as overhead_usd,
  round(sum(usd) filter (where direction = 'egreso' and scope = 'proyecto'), 2) as project_cost_usd,
  round(
    coalesce(sum(usd) filter (where direction = 'ingreso'), 0)
    - coalesce(sum(usd) filter (where direction = 'egreso'), 0), 2
  ) as net_usd
from public.cash_movements
group by 1;

-- -------------------------------------------------------------
-- Gasto por método de pago: "¿qué pagamos con esta tarjeta?"
-- -------------------------------------------------------------

create or replace view public.spend_by_payment_method as
select
  pm.id as payment_method_id,
  pm.label,
  pm.kind,
  pm.institution,
  extract(year from m.occurred_on)::int as year,
  date_trunc('month', m.occurred_on)::date as period,
  round(sum(m.usd), 2) as usd_total,
  count(*) as movimientos
from public.cash_movements m
join public.payment_methods pm on pm.id = m.payment_method_id
where m.direction = 'egreso'
group by pm.id, pm.label, pm.kind, pm.institution, 5, 6;

-- -------------------------------------------------------------
-- Gasto por categoría
-- -------------------------------------------------------------

create or replace view public.spend_by_category as
select
  ec.id as category_id,
  ec.name,
  ec.sort_order,
  extract(year from m.occurred_on)::int as year,
  round(sum(m.usd), 2) as usd_total
from public.cash_movements m
join public.expense_categories ec on ec.id = m.category_id
where m.direction = 'egreso'
group by ec.id, ec.name, ec.sort_order, 4;
