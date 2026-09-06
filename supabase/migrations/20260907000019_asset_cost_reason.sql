-- =============================================================
-- Todo activo tiene una causa de gasto identificada
--
-- Regla: si un activo no está asignado a ningún proyecto, su costo
-- es de Nova. Eso no lo hace invisible: hay que saber POR QUÉ se
-- paga (una reserva de dominio, una herramienta interna) y tiene
-- que computar como gasto de estructura y como aporte del socio
-- que lo paga.
--
-- Antes, los activos sin proyecto no entraban en cash_movements:
-- 24 activos y USD 1.074,92 anuales quedaban fuera de todo cálculo.
-- =============================================================

alter table public.assets
  add column cost_reason text
    check (cost_reason in (
      'reserva_dominio',
      'herramienta_interna',
      'infraestructura',
      'marca',
      'cliente_potencial',
      'otro'
    ));

comment on column public.assets.cost_reason is
  'Por qué Nova paga este activo cuando no está asignado a un proyecto. Sin causa, el activo queda marcado como no identificado.';

-- -------------------------------------------------------------
-- Activos sin proyecto: costo de estructura de Nova
-- -------------------------------------------------------------

create or replace view public.unassigned_assets as
select
  a.id,
  a.name,
  a.type,
  a.provider,
  a.cost,
  a.currency,
  a.billing_cycle,
  a.expires_at,
  a.cost_reason,
  pm.label as paid_with,
  pt.name as funded_by,
  round(
    (case when a.currency = 'UYU'
      then a.cost / (select value from public.app_settings where key = 'usd_uyu_rate')
      else a.cost end) * coalesce(
        case a.billing_cycle
          when 'mensual' then 12 when 'trimestral' then 4
          when 'semestral' then 2 when 'anual' then 1
          else 0 end, 0)
  , 2) as usd_year
from public.assets a
left join public.asset_assignments aa
  on aa.asset_id = a.id and aa.assigned_until is null
left join public.payment_methods pm on pm.id = a.payment_method_id
left join public.partners pt on pt.id = pm.owner_partner_id
where a.deleted_at is null
  and aa.id is null;

-- -------------------------------------------------------------
-- El flujo de caja debe incluir los activos sin proyecto,
-- como egreso de empresa. Antes quedaban fuera por completo.
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
recurring as (
  select
    s.id::text,
    'recurrente',
    s.direction,
    s.scope,
    s.project_id,
    s.category_id,
    s.payment_method_id,
    s.concept,
    h.month_start,
    case
      when s.direction = 'ingreso'
        then case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end
      else case when s.net_currency = 'UYU' then coalesce(s.net_cost, 0) / r.usd_uyu
                else coalesce(s.net_cost, 0) end
    end,
    case when s.direction = 'ingreso' then s.billing_status else s.payment_status end
  from public.recurring_services s
  cross join rate r
  cross join horizon h
  left join public.service_schedule sc on sc.service_id = s.id
  where s.active
    and s.confirmation_status <> 'rechazada'
    and public.cycle_months(s.frequency) > 0
    and mod(
      abs(
        (extract(year from h.month_start)::int * 12 + extract(month from h.month_start)::int)
        - (extract(year from coalesce(sc.renewal_date, s.next_billing_date, current_date))::int * 12
           + extract(month from coalesce(sc.renewal_date, s.next_billing_date, current_date))::int)
      ),
      public.cycle_months(s.frequency)
    ) = 0
    and (sc.effective_first_charge is null
         or h.month_start >= date_trunc('month', sc.effective_first_charge)::date)
),
-- Activos con proyecto: costo del proyecto
asset_assigned as (
  select
    a.id::text,
    'activo',
    'egreso',
    'proyecto',
    aa.project_id,
    null::uuid,
    a.payment_method_id,
    a.name,
    h.month_start,
    case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end,
    'pendiente'
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
),
-- Activos sin proyecto: costo de estructura de Nova
asset_unassigned as (
  select
    a.id::text,
    'activo',
    'egreso',
    'empresa',
    null::uuid,
    null::uuid,
    a.payment_method_id,
    a.name,
    h.month_start,
    case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end,
    'pendiente'
  from public.assets a
  left join public.asset_assignments aa on aa.asset_id = a.id and aa.assigned_until is null
  cross join rate r
  cross join horizon h
  where a.deleted_at is null
    and aa.id is null
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
union all select * from recurring
union all select * from asset_assigned
union all select * from asset_unassigned;
